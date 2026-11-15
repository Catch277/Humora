-- SCRUM-96 — mobile clock-in / clock-out (A4 "Automated Timekeeping", approved option A1).
-- Run this script in Supabase Dashboard → SQL Editor, after SCRUM-95. Idempotent: safe to re-run.
--
-- Why a function pair and not a new HTTP API: the mobile app talks to Supabase directly (it already
-- reads `attendance` that way), and every rule a check-in carries — the caller's branch, the ca they
-- are scheduled for, the status the arrival justifies, the duplicate / "Vào ca lại" case, the
-- derived columns — already lives on this side of the wire. A raw `insert` from the app would either
-- duplicate those rules (and drift) or write a row the website then has to repair. So the app calls
-- one function per action and the database owns the rules once — the shape SCRUM-90 uses for payroll.
--
-- `security invoker` on purpose: the function runs as the caller, so `attendance_insert_own` /
-- `attendance_update_own` (SCRUM-53/63/68) and `current_branch_id()` still decide what is written.
-- Nothing here is privileged; the branch and role checks below exist to answer a *sentence* instead
-- of a policy that silently matches no row — the same reasoning as `requireCapability` + the use
-- cases on the web side.
--
-- What these functions mirror, and must keep mirroring:
--   * `lib/usecases/RecordCheckInUseCase.ts` / `RecordCheckOutUseCase.ts` — the web clock;
--   * `lib/usecases/attendanceStatus.ts` — `CHECK_IN_GRACE_MINUTES`, `resolveCheckInStatus`,
--     `resolveCheckOutStatus`, `resolveStoredStatus`, `isShiftStillRunning`;
--   * `lib/usecases/shiftWindow.ts` — the `[start − grace, end − grace]` check-in window;
--   * `public.attendance_grace_minutes()` (SCRUM-71) — the one integer all of them read.
-- Change one and change the others in the same commit: the web and the app must never disagree
-- about whether somebody was late.
--
-- The timestamps are the **device's** (`p_check_in_at` / `p_check_out_at`), because a tap made
-- offline has to survive until the phone has a connection and still land on the day it really
-- happened. That is a deliberate trade: a wrong phone clock is possible, so (a) a timestamp more than
-- five minutes in the future is refused, (b) `attendance.created_at` records the real receipt time,
-- and (c) the gap between the two is what the website reports as `SYNC_DELAY`. `work_date` is derived
-- from that timestamp on the Bangkok wall clock, never from `now()`, so a late sync lands on its own
-- day — and an employee can only do that for a day they were actually scheduled (the assignment
-- lookup below is the same one the web clock uses).
--
-- Machine tokens (the app maps them by name, the way its `attendanceErrorMessages` table already
-- does; the Postgres state is only a hint for a generic handler):
--   AUTH_REQUIRED, PROFILE_MISSING                    28000  → no session / no `users` row
--   ATT_OWNER_FORBIDDEN, BRANCH_FORBIDDEN             42501  → 403
--   SHIFT_NOT_FOUND                                    P0002  → 404
--   ATT_NOT_CHECKED_IN                                 P0002  → 404
--   ATT_BRANCH_REQUIRED, ATT_BRANCH_NOT_ASSIGNED
--   ATT_NO_SHIFT_TODAY, ATT_TIME_REQUIRED, ATT_CLOCK_AHEAD
--   ATT_NOTE_TOO_LONG, ATT_COORDINATES_INVALID, ATT_PHOTO_PATH_INVALID
--   ATT_SHIFT_NOT_STARTED: …, ATT_SHIFT_ENDED: …
--   ATT_ALREADY_CHECKED_IN, ATT_ALREADY_CHECKED_OUT
--   ATT_AMBIGUOUS_SHIFT, ATT_CHECK_OUT_BEFORE_IN       P0001  → 400 / 409

-- ── 0. The one time helper both functions need ──────────────────────────────────────────────
-- The mirror of `businessMinutesOfDay` in lib/usecases/attendanceStatus.ts. `stable`, not
-- `immutable`, because it resolves a zone name; it is only ever used in a comparison, never in an
-- index. Granted to `authenticated` so the invoker functions can call it.
create or replace function public.attendance_minutes_of_day(p_at timestamptz)
returns integer
language sql
stable
as $$
  select extract(hour from (p_at at time zone 'Asia/Bangkok'))::integer * 60
       + extract(minute from (p_at at time zone 'Asia/Bangkok'))::integer;
$$;

comment on function public.attendance_minutes_of_day(timestamptz) is
  'A4/SCRUM-96: phút trong ngày theo giờ Asia/Bangkok — bản SQL của businessMinutesOfDay (lib/usecases/attendanceStatus.ts).';

-- ── 0b. The grace constant must be callable by the invoker functions ────────────────────────
-- SCRUM-71 revoked this helper from `authenticated` together with the notification helpers, because
-- a member must not be able to *forge* a notification. It returns the integer 5 and reads no table,
-- so that revoke never protected anything about *it* — while an invoker function (which runs as the
-- caller) needs EXECUTE to read it. Re-granting keeps the one-copy rule
-- (`CHECK_IN_GRACE_MINUTES` in lib/usecases/attendanceStatus.ts, `attendance_grace_minutes()` here)
-- without reopening the fan-out hole, which lives in `notify_user` / `notify_users` and stays revoked.
grant execute on function public.attendance_grace_minutes() to authenticated;


-- ── 1. attendance_clock_in ──────────────────────────────────────────────────────────────────
-- One arrival. `p_shift_id` names the ca: required for an EMPLOYEE (it must be one they are
-- SCHEDULED for that day), optional for a MANAGER (who may also work unscheduled). `p_branch_id` is
-- the branch a MANAGER clocks in at — required for them, ignored for an employee, whose branch comes
-- from the schedule (the same rule as `resolveManagerTarget` / `resolveEmployeeTarget`).
--
-- The photo is an **object path** in the private bucket (SCRUM-95), uploaded by the app before it
-- calls this function; the path is validated against the caller's own folder, so a client cannot
-- point a row at somebody else's face.
create or replace function public.attendance_clock_in(
  p_latitude double precision,
  p_longitude double precision,
  p_check_in_at timestamptz,
  p_shift_id uuid default null,
  p_photo_path text default null,
  p_note text default null,
  p_branch_id uuid default null
)
returns public.attendance
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_home_branch uuid;
  v_work_date date;
  v_grace integer := public.attendance_grace_minutes();
  v_shift public.shifts;
  v_shift_id uuid := p_shift_id;
  v_target_branch uuid;
  v_assignment_branch uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_status text;
  v_existing public.attendance;
  v_row public.attendance;
begin
  -- ── Who is calling ────────────────────────────────────────────────────────────────────────
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select u.branch_id into v_home_branch
  from public.users u
  where u.id = v_uid;

  if not found then
    raise exception 'PROFILE_MISSING' using errcode = '28000';
  end if;

  -- SCRUM-68: the organization's owner stands above the operation and never clocks in.
  if public.is_organization_owner() then
    raise exception 'ATT_OWNER_FORBIDDEN' using errcode = '42501';
  end if;

  -- ── The device's timestamp: checked, not trusted ─────────────────────────────────────────
  if p_check_in_at is null then
    raise exception 'ATT_TIME_REQUIRED' using errcode = 'P0001';
  end if;

  if p_check_in_at > now() + interval '5 minutes' then
    raise exception 'ATT_CLOCK_AHEAD' using errcode = 'P0001';
  end if;

  v_work_date := (p_check_in_at at time zone 'Asia/Bangkok')::date;

  if (p_latitude is not null and (p_latitude < -90 or p_latitude > 90))
     or (p_longitude is not null and (p_longitude < -180 or p_longitude > 180)) then
    raise exception 'ATT_COORDINATES_INVALID' using errcode = 'P0001';
  end if;

  if length(btrim(coalesce(p_note, ''))) > 500 then
    raise exception 'ATT_NOTE_TOO_LONG' using errcode = 'P0001';
  end if;

  -- The path is the contract SCRUM-95 writes down: <org>/<employee>/<work_date>/<in|out>-….jpg.
  -- Enforcing it here is what keeps the storage policies meaningful for rows written by this
  -- function (a row may only reference an object inside the caller's own folder).
  if p_photo_path is not null and btrim(p_photo_path) <> '' then
    if length(p_photo_path) > 2000
       or split_part(p_photo_path, '/', 1) <> public.current_organization_id()::text
       or split_part(p_photo_path, '/', 2) <> v_uid::text
       or split_part(p_photo_path, '/', 3) <> v_work_date::text
       or p_photo_path !~* '\.(jpe?g|png|webp)$' then
      raise exception 'ATT_PHOTO_PATH_INVALID' using errcode = 'P0001';
    end if;
  else
    p_photo_path := null;
  end if;

  -- ── Which branch and ca the arrival belongs to ─────────────────────────────────────────────
  if public.is_organization_manager() then
    -- A manager clocks in at a branch they head (SCRUM-61/63) and may name a ca. The owner never
    -- reaches this line; `is_organization_manager()` includes them, the check above excluded them.
    if p_branch_id is null then
      raise exception 'ATT_BRANCH_REQUIRED' using errcode = 'P0001';
    end if;

    if not public.heads_branch(p_branch_id) then
      raise exception 'BRANCH_FORBIDDEN' using errcode = '42501';
    end if;

    v_target_branch := p_branch_id;
  else
    -- An employee clocks in at their own branch, against a ca they are scheduled for that day.
    -- `branch_id` in the body is ignored on purpose: the schedule is the authority.
    if v_home_branch is null then
      raise exception 'ATT_BRANCH_NOT_ASSIGNED' using errcode = 'P0001';
    end if;

    if v_shift_id is null then
      raise exception 'ATT_NO_SHIFT_TODAY' using errcode = 'P0001';
    end if;

    select sa.branch_id into v_assignment_branch
    from public.shift_assignments sa
    where sa.employee_id = v_uid
      and sa.work_date = v_work_date
      and sa.shift_id = v_shift_id
      and sa.status = 'SCHEDULED'
    limit 1;

    if not found then
      raise exception 'ATT_NO_SHIFT_TODAY' using errcode = 'P0001';
    end if;

    if v_assignment_branch <> v_home_branch then
      raise exception 'BRANCH_FORBIDDEN' using errcode = '42501';
    end if;

    v_target_branch := v_assignment_branch;
  end if;

  -- The ca's hours: what the window, the lateness verdict and the worked time all read. A manager
  -- who named no ca has none (an unscheduled arrival, which the reviewer reads as such).
  if v_shift_id is not null then
    select * into v_shift from public.shifts s where s.id = v_shift_id;

    if not found then
      raise exception 'SHIFT_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  -- ── The caller's own row for that ca and day ───────────────────────────────────────────────
  -- `is not distinct from` covers the unscheduled case (`shift_id is null`), which the unique index
  -- does not (Postgres treats NULLs as distinct); the same null-safe comparison the use case makes.
  select * into v_existing
  from public.attendance a
  where a.employee_id = v_uid
    and a.work_date = v_work_date
    and a.shift_id is not distinct from v_shift_id
  order by a.created_at desc
  limit 1;

  if found then
    -- A row that was never closed is a plain duplicate.
    if v_existing.check_out_at is null then
      raise exception 'ATT_ALREADY_CHECKED_IN' using errcode = 'P0001';
    end if;

    -- "Vào ca lại" (`isShiftStillRunning`): allowed while the ca is still running — the same
    -- boundary that decides EARLY_LEAVE, so a record that reads "Về sớm" is one that can be
    -- re-opened. Once the ca is over the check-out stands: it was the real end of the shift.
    if v_shift.end_time is null
       or public.attendance_minutes_of_day(now())
          >= (extract(hour from v_shift.end_time)::integer * 60
              + extract(minute from v_shift.end_time)::integer) - v_grace then
      raise exception 'ATT_ALREADY_CHECKED_IN: ca đã hết giờ làm nên giờ ra vẫn được giữ nguyên.' using errcode = 'P0001';
    end if;

    -- `resolveStoredStatus`: the arrival verdict is re-derived from the giờ vào the row stores, never
    -- read off the status column (a check-out stores EARLY_LEAVE and used to erase LATE). A row a
    -- manager corrected keeps its status — that is the recorded truth.
    if v_existing.corrected_by is not null or v_existing.check_in_at is null then
      v_status := v_existing.status;
    elsif v_shift.start_time is null then
      v_status := 'ON_TIME';
    elsif public.attendance_minutes_of_day(v_existing.check_in_at)
          > (extract(hour from v_shift.start_time)::integer * 60
             + extract(minute from v_shift.start_time)::integer) + v_grace then
      v_status := 'LATE';
    else
      v_status := 'ON_TIME';
    end if;

    -- Only the closing columns are cleared, so `attendance_guard_self_update` (SCRUM-21/59) is
    -- satisfied: the check-in facts the employee submitted stay exactly as they are.
    update public.attendance
    set check_out_at = null,
        check_out_latitude = null,
        check_out_longitude = null,
        status = v_status,
        updated_at = now()
    where id = v_existing.id
    returning * into v_row;

    return v_row;
  end if;

  -- ── A brand-new arrival must fall inside the ca's working time ────────────────────────────
  -- `[start − grace, end − grace]`, the same grace that decides Đi muộn and that governs "Vào ca
  -- lại" (`checkInWindowVerdict`). Instants, not minutes-of-day, so a ca crossing midnight behaves
  -- like a daytime one. A template without hours (or the zero-length "Nghỉ") has no window and is
  -- left alone.
  if v_shift.start_time is not null
     and v_shift.end_time is not null
     and v_shift.start_time <> v_shift.end_time then
    v_start := (v_work_date + v_shift.start_time) at time zone 'Asia/Bangkok';
    v_end := (v_work_date + v_shift.end_time) at time zone 'Asia/Bangkok';

    if v_end <= v_start then
      v_end := v_end + interval '1 day';
    end if;

    if p_check_in_at < v_start - make_interval(mins => v_grace) then
      raise exception 'ATT_SHIFT_NOT_STARTED: % (%)',
        v_shift.name, to_char(v_shift.start_time, 'HH24:MI')
        using errcode = 'P0001';
    end if;

    if p_check_in_at > v_end - make_interval(mins => v_grace) then
      raise exception 'ATT_SHIFT_ENDED: % (%)',
        v_shift.name, to_char(v_shift.end_time, 'HH24:MI')
        using errcode = 'P0001';
    end if;
  end if;

  -- `resolveCheckInStatus`: LATE once the arrival is more than the grace past the ca start, on the
  -- Bangkok wall clock. A ca without a start time cannot judge punctuality and is ON_TIME.
  if v_shift.start_time is null then
    v_status := 'ON_TIME';
  elsif public.attendance_minutes_of_day(p_check_in_at)
        > (extract(hour from v_shift.start_time)::integer * 60
           + extract(minute from v_shift.start_time)::integer) + v_grace then
    v_status := 'LATE';
  else
    v_status := 'ON_TIME';
  end if;

  -- `organization_id` is not sent: it defaults to `current_organization_id()` and
  -- `attendance_insert_own` checks it. `check_in_distance_m`, `worked_seconds` and `resumed_at` are
  -- derived by triggers (SCRUM-21/69) — clients never write them.
  begin
    insert into public.attendance (
      employee_id,
      branch_id,
      shift_id,
      work_date,
      check_in_at,
      check_in_latitude,
      check_in_longitude,
      check_in_photo_url,
      note,
      status
    )
    values (
      v_uid,
      v_target_branch,
      v_shift_id,
      v_work_date,
      p_check_in_at,
      p_latitude,
      p_longitude,
      p_photo_path,
      nullif(btrim(coalesce(p_note, '')), ''),
      v_status
    )
    returning * into v_row;
  exception
    when unique_violation then
      -- Two taps racing past the duplicate check above.
      raise exception 'ATT_ALREADY_CHECKED_IN' using errcode = 'P0001';
  end;

  return v_row;
end;
$$;

-- ── 2. attendance_clock_out ─────────────────────────────────────────────────────────────────
-- Closes the caller's own row: `p_attendance_id` names it, or — when omitted — the single open row of
-- the day the departure belongs to. Two open ca cannot be told apart without being named, so that
-- case answers `ATT_AMBIGUOUS_SHIFT` instead of closing whichever row came back first (the same rule
-- as `pickOpenRow` / `pickNamedRow`).
--
-- Only the closing columns are written. The check-in facts stay exactly as the employee reported
-- them, which is what `attendance_guard_self_update` protects and what the reviewer reads.
create or replace function public.attendance_clock_out(
  p_latitude double precision,
  p_longitude double precision,
  p_check_out_at timestamptz,
  p_attendance_id uuid default null,
  p_photo_path text default null,
  p_note text default null
)
returns public.attendance
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_grace integer := public.attendance_grace_minutes();
  v_work_date date;
  v_shift public.shifts;
  v_row public.attendance;
  v_stored text;
  v_status text;
  v_open_count integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if not exists (select 1 from public.users u where u.id = v_uid) then
    raise exception 'PROFILE_MISSING' using errcode = '28000';
  end if;

  -- Same rule as the check-in (SCRUM-68): the owner does not clock in or out.
  if public.is_organization_owner() then
    raise exception 'ATT_OWNER_FORBIDDEN' using errcode = '42501';
  end if;

  if p_check_out_at is null then
    raise exception 'ATT_TIME_REQUIRED' using errcode = 'P0001';
  end if;

  if p_check_out_at > now() + interval '5 minutes' then
    raise exception 'ATT_CLOCK_AHEAD' using errcode = 'P0001';
  end if;

  if (p_latitude is not null and (p_latitude < -90 or p_latitude > 90))
     or (p_longitude is not null and (p_longitude < -180 or p_longitude > 180)) then
    raise exception 'ATT_COORDINATES_INVALID' using errcode = 'P0001';
  end if;

  if length(btrim(coalesce(p_note, ''))) > 500 then
    raise exception 'ATT_NOTE_TOO_LONG' using errcode = 'P0001';
  end if;

  v_work_date := (p_check_out_at at time zone 'Asia/Bangkok')::date;

  -- The named row must be one of the caller's own **of that business day**; `employee_id = v_uid` is
  -- repeated because the caller may be a manager, whose RLS read scope covers the whole organization,
  -- and the date check is what stops an old forgotten row from being closed days later and banking
  -- the whole span as worked time. A stale row is a manager's "Sửa giờ" (who and why), exactly as on
  -- the web (`RecordCheckOutUseCase` reads only today's rows).
  if p_attendance_id is not null then
    select * into v_row
    from public.attendance a
    where a.id = p_attendance_id
      and a.employee_id = v_uid
      and a.work_date = v_work_date;

    if not found or v_row.check_in_at is null then
      -- A wrong id, somebody else's row, a stale row and "never checked in" are one answer (the web's 404).
      raise exception 'ATT_NOT_CHECKED_IN' using errcode = 'P0002';
    end if;

    if v_row.check_out_at is not null then
      raise exception 'ATT_ALREADY_CHECKED_OUT' using errcode = 'P0001';
    end if;
  else
    select count(*) into v_open_count
    from public.attendance a
    where a.employee_id = v_uid
      and a.work_date = v_work_date
      and a.check_in_at is not null
      and a.check_out_at is null;

    if v_open_count = 0 then
      -- A closed row explains itself better than "you never checked in".
      if exists (
        select 1
        from public.attendance a
        where a.employee_id = v_uid
          and a.work_date = v_work_date
          and a.check_out_at is not null
      ) then
        raise exception 'ATT_ALREADY_CHECKED_OUT' using errcode = 'P0001';
      end if;

      raise exception 'ATT_NOT_CHECKED_IN' using errcode = 'P0002';
    end if;

    if v_open_count > 1 then
      raise exception 'ATT_AMBIGUOUS_SHIFT' using errcode = 'P0001';
    end if;

    select * into v_row
    from public.attendance a
    where a.employee_id = v_uid
      and a.work_date = v_work_date
      and a.check_in_at is not null
      and a.check_out_at is null
    limit 1;
  end if;

  -- The device's departure must come after the segment that is currently open — the giờ vào, or the
  -- last "Vào ca lại" — otherwise `attendance_track_worked_time` would bank a negative segment and the
  -- timesheet would print a departure before the entry.
  if p_check_out_at <= coalesce(v_row.resumed_at, v_row.check_in_at) then
    raise exception 'ATT_CHECK_OUT_BEFORE_IN' using errcode = 'P0001';
  end if;

  -- The check-out photo lives in the same folder as the check-in one, so the work date in the path is
  -- the **row's** work date (an overnight ca does not move it to the next day).
  if p_photo_path is not null and btrim(p_photo_path) <> '' then
    if length(p_photo_path) > 2000
       or split_part(p_photo_path, '/', 1) <> public.current_organization_id()::text
       or split_part(p_photo_path, '/', 2) <> v_uid::text
       or split_part(p_photo_path, '/', 3) <> v_row.work_date::text
       or p_photo_path !~* '\.(jpe?g|png|webp)$' then
      raise exception 'ATT_PHOTO_PATH_INVALID' using errcode = 'P0001';
    end if;
  else
    p_photo_path := null;
  end if;

  -- The ca's hours come from the row's own shift; a row without one (an unscheduled arrival) has no
  -- end and therefore no early-leave verdict.
  if v_row.shift_id is not null then
    select * into v_shift from public.shifts s where s.id = v_row.shift_id;
  end if;

  -- `resolveStoredStatus`: what the arrival justified, re-derived from the giờ vào the row stores.
  -- A manager's correction keeps the stored status (it carries who and why).
  if v_row.corrected_by is not null or v_row.check_in_at is null then
    v_stored := v_row.status;
  elsif v_shift.start_time is null then
    v_stored := 'ON_TIME';
  elsif public.attendance_minutes_of_day(v_row.check_in_at)
        > (extract(hour from v_shift.start_time)::integer * 60
           + extract(minute from v_shift.start_time)::integer) + v_grace then
    v_stored := 'LATE';
  else
    v_stored := 'ON_TIME';
  end if;

  -- `resolveCheckOutStatus`: a late arrival stays LATE (one column cannot carry both facts, and the
  -- lateness came first); otherwise leaving before the end, beyond the grace, is EARLY_LEAVE.
  v_status := v_stored;

  if v_stored <> 'LATE' and v_shift.end_time is not null then
    if public.attendance_minutes_of_day(p_check_out_at)
       < (extract(hour from v_shift.end_time)::integer * 60
          + extract(minute from v_shift.end_time)::integer) - v_grace then
      v_status := 'EARLY_LEAVE';
    end if;
  end if;

  -- `check_out_photo_url` keeps the previous value when this call carries no photo (a retry after a
  -- lost response must not erase the evidence); `note` is only replaced when one is sent, so the
  -- check-in note survives a check-out.
  update public.attendance
  set check_out_at = p_check_out_at,
      check_out_latitude = p_latitude,
      check_out_longitude = p_longitude,
      check_out_photo_url = coalesce(p_photo_path, check_out_photo_url),
      note = case
        when p_note is null then note
        else nullif(btrim(p_note), '')
      end,
      status = v_status,
      updated_at = now()
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

-- ── 3. Documentation, privileges, verification ──────────────────────────────────────────────
comment on function public.attendance_clock_in(double precision, double precision, timestamptz, uuid, text, text, uuid) is
  'A4/SCRUM-96: chấm công vào ca từ app mobile (security invoker, RLS vẫn quyết định). Trả về dòng attendance; lỗi dùng token ATT_* / BRANCH_* để app dịch thành câu tiếng Việt.';
comment on function public.attendance_clock_out(double precision, double precision, timestamptz, uuid, text, text) is
  'A4/SCRUM-96: chấm công ra ca từ app mobile (security invoker). Chỉ ghi các cột kết thúc; giờ vào do nhân viên báo vẫn giữ nguyên.';

-- The app is the caller: `authenticated` may execute, `anon` may not (a signed-out request has no
-- auth.uid() and would only reach AUTH_REQUIRED anyway — this keeps the surface closed).
revoke all on function public.attendance_minutes_of_day(timestamptz) from public, anon;
grant execute on function public.attendance_minutes_of_day(timestamptz)
  to authenticated, service_role;

revoke all on function public.attendance_clock_in(
  double precision, double precision, timestamptz, uuid, text, text, uuid
) from public, anon;
grant execute on function public.attendance_clock_in(
  double precision, double precision, timestamptz, uuid, text, text, uuid
) to authenticated;

revoke all on function public.attendance_clock_out(
  double precision, double precision, timestamptz, uuid, text, text
) from public, anon;
grant execute on function public.attendance_clock_out(
  double precision, double precision, timestamptz, uuid, text, text
) to authenticated;

-- ── 4. How the app calls them (PostgREST RPC, named arguments) ──────────────────────────────
--   const { data, error } = await supabase.rpc('attendance_clock_in', {
--     p_latitude: position.latitude,
--     p_longitude: position.longitude,
--     p_check_in_at: new Date().toISOString(),   // the device's time, not the server's
--     p_shift_id: shiftId,                       // required for an EMPLOYEE
--     p_photo_path: uploadedPath,                // upload to the bucket FIRST (SCRUM-95)
--     p_note: null,
--     p_branch_id: null,                         // a MANAGER passes the branch they head
--   });
--
--   await supabase.rpc('attendance_clock_out', {
--     p_latitude: position.latitude,
--     p_longitude: position.longitude,
--     p_check_out_at: new Date().toISOString(),
--     p_attendance_id: openAttendanceId,         // or omit when exactly one ca is open
--     p_photo_path: uploadedPath,
--   });
--
-- Both answer the `attendance` row, so the app can refresh its own list from the response instead of
-- guessing. Errors arrive as a Postgres exception: match the leading token (before the colon) and
-- translate it in the app — never surface the raw message to the employee.
--
-- Not covered here, on purpose: an offline queue (that is the app's), a scheduled "no-show" sweep
-- (needs `pg_cron`, an ask-first change) and the `SYNC_DELAY` verdict (`created_at − check_in_at`) —
-- that one belongs to the website's exception module, which reads these rows.

-- ── 5. Verify ───────────────────────────────────────────────────────────────────────────────
-- 1. Both clock functions must be `security invoker` (`prosecdef = false`) and must answer only
--    `authenticated`. A `true` for `anon` would open them to a signed-out caller.
select
  p.proname,
  p.prosecdef,
  pg_get_function_identity_arguments(p.oid) as arguments,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'attendance_clock_in', 'attendance_clock_out', 'attendance_minutes_of_day',
    'attendance_grace_minutes'
  )
order by p.proname;

-- 2. The time helper must agree with the app's business clock: 08:30 Bangkok is 510 minutes, and
--    17:00 UTC is midnight Bangkok.
select
  public.attendance_minutes_of_day('2026-11-14 01:30:00+00'::timestamptz) as should_be_510,
  public.attendance_minutes_of_day('2026-11-14 17:00:00+00'::timestamptz) as should_be_0;

-- 3. Run the real scenarios through the app (or PostgREST with a user's JWT). The SQL editor has no
--    `auth.uid()`, so every call typed here answers AUTH_REQUIRED by design:
--      employee scheduled for "Ca sáng" today:  clock in → 1 row, LATE / ON_TIME as expected
--      the same call again:                     ATT_ALREADY_CHECKED_IN
--      clock out:                               1 closed row, worked_seconds > 0
--      clock in again while the ca still runs:  the same row re-opened (same id), status re-derived
--      clock in after the ca ended:             ATT_ALREADY_CHECKED_IN: ca đã hết giờ…
--      a photo path outside <org>/<me>/<date>/: ATT_PHOTO_PATH_INVALID
--      a check-in long before the ca opens:     ATT_SHIFT_NOT_STARTED: Ca sáng (08:30)
--      a check-in after the ca ends:            ATT_SHIFT_ENDED: Ca sáng (12:30)
--      the organization's owner:                ATT_OWNER_FORBIDDEN
--      a manager for a branch they do not head: BRANCH_FORBIDDEN
--      an employee with users.branch_id null:   ATT_BRANCH_NOT_ASSIGNED
--      an employee with no SCHEDULED ca today:  ATT_NO_SHIFT_TODAY
--      a device clock set a day ahead:          ATT_CLOCK_AHEAD
--      an unscheduled manager check-in:         a row with shift_id null (no window)
--      a clock-out before the stored check-in:  ATT_CHECK_OUT_BEFORE_IN
--
-- 4. The returned row must carry the derived columns, proving the triggers ran:
--      select id, work_date, check_in_at, check_out_at, status, worked_seconds, resumed_at,
--             check_in_distance_m, check_in_photo_url
--      from public.attendance
--      order by created_at desc limit 5;








