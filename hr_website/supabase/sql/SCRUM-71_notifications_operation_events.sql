-- SCRUM-71 — notification triggers for the daily operation (doanh thu, đơn từ, xếp ca, chấm công).
-- ============================================================================================
-- One trigger per *transition*, never one per table: `old.closed_at is null and new.closed_at is
-- not null` is the close of a ca, `old.status is distinct from new.status` is a decision, and so on.
-- A trigger that fired on every UPDATE would turn an ordinary edit into a burst of messages; the
-- 5-minute dedupe window in `notify_user` (SCRUM-70) is the second line of defence, not the first.
--
-- Who is told what, by role:
--   * EMPLOYEE — the events about their own work: a ca was assigned, moved or deleted; their đơn was
--     decided; their timesheet was corrected or verified; their khiếu nại was resolved. RLS already
--     guarantees an employee only ever reads their own inbox (`user_id = auth.uid()`).
--   * MANAGER — the events of the branch they head (`branches.manager_id`): a new đơn, an exception
--     in the timesheet (đi muộn / ngoài vùng / vào ca lại / về sớm), a khiếu nại.
--   * OWNER   — the organization: doanh thu (including a lệch figure), a new đơn, a manager's
--     decision, a geofence breach, a khiếu nại.
--
-- Attendance is deliberately **exception-only**. A manager whose bell rang for every check-in would
-- stop reading it; the review screen remains the place where the whole timesheet is visible.
--
-- The lateness and early-leave verdicts are re-derived here from `check_in_at` + the ca's hours
-- (`notification_is_late` / `notification_is_early_leave`), not read back from `attendance.status`:
-- that column is what a *client* wrote, and SCRUM-69 was about exactly this — a stored verdict must
-- never be trusted as evidence. The 5-minute grace mirrors `CHECK_IN_GRACE_MINUTES` in
-- lib/usecases/attendanceStatus.ts; change both together.
--
-- Depends on SCRUM-70 (the fan-out helpers). Applied by hand: Supabase Dashboard → SQL Editor.
-- Idempotent: safe to re-run.

-- ── 1. Shift/attendance display + verdict helpers ────────────────────────────────────────────

-- Mirrors CHECK_IN_GRACE_MINUTES in lib/usecases/attendanceStatus.ts. One integer, in one place.
create or replace function public.attendance_grace_minutes()
returns integer
language sql
immutable
as $$
  select 5;
$$;

create or replace function public.notification_shift_label(p_shift_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(btrim(s.name), '') from public.shifts s where s.id = p_shift_id),
    'Ca làm việc'
  );
$$;

-- `08:00–17:00`, or NULL for a template without hours (which cannot judge punctuality).
create or replace function public.notification_shift_window(p_shift_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when s.start_time is null or s.end_time is null then null
    else to_char(s.start_time, 'HH24:MI') || '–' || to_char(s.end_time, 'HH24:MI')
  end
  from public.shifts s
  where s.id = p_shift_id;
$$;

-- `Ca sáng (08:00–17:00)` — the phrase every shift notification uses. A template without hours
-- loses the parenthesis instead of printing `(—)`.
create or replace function public.notification_shift_phrase(p_shift_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.notification_shift_label(p_shift_id)
    || coalesce(' (' || public.notification_shift_window(p_shift_id) || ')', '');
$$;

-- Seconds since midnight on the Bangkok wall clock — the unit `attendanceStatus.ts` compares
-- (`businessMinutesOfDay`). Comparing two `time` values directly would wrap around midnight and call
-- a 23:40 arrival on time for a 00:10 ca.
create or replace function public.notification_seconds_of_day(p_at timestamptz)
returns numeric
language sql
stable
as $$
  select case
    when p_at is null then null
    else extract(epoch from (p_at at time zone 'Asia/Bangkok')::time)
  end;
$$;

-- More than the grace past the ca's start time — the same test `resolveCheckInStatus` makes. A
-- check-in with no ca, or a ca without `start_time`, is never late: there is nothing to be late for.
create or replace function public.notification_is_late(p_check_in_at timestamptz, p_shift_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select public.notification_seconds_of_day(p_check_in_at)
             > extract(epoch from s.start_time) + public.attendance_grace_minutes() * 60
      from public.shifts s
      where s.id = p_shift_id
        and s.start_time is not null
        and p_check_in_at is not null
    ),
    false
  );
$$;

-- Before the ca's end time **and** an on-time arrival — the mirror of `resolveCheckOutStatus`, which
-- only ever marks `EARLY_LEAVE` on a record that was not `LATE` (a late arrival who leaves early
-- keeps the lateness until a manager corrects the row).
create or replace function public.notification_is_early_leave(
  p_check_in_at timestamptz,
  p_check_out_at timestamptz,
  p_shift_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p_check_out_at is not null
             and s.end_time is not null
             and public.notification_seconds_of_day(p_check_out_at)
                 < extract(epoch from s.end_time) - public.attendance_grace_minutes() * 60
             and not public.notification_is_late(p_check_in_at, p_shift_id)
      from public.shifts s
      where s.id = p_shift_id
    ),
    false
  );
$$;

-- Same reason as SCRUM-70: these are internal. A member must not reach them through PostgREST (they
-- read `shifts` for an id the caller may not be allowed to see).
revoke execute on function public.attendance_grace_minutes() from public, anon, authenticated;
revoke execute on function public.notification_shift_label(uuid) from public, anon, authenticated;
revoke execute on function public.notification_shift_window(uuid) from public, anon, authenticated;
revoke execute on function public.notification_shift_phrase(uuid) from public, anon, authenticated;
revoke execute on function public.notification_seconds_of_day(timestamptz)
  from public, anon, authenticated;
revoke execute on function public.notification_is_late(timestamptz, uuid)
  from public, anon, authenticated;
revoke execute on function public.notification_is_early_leave(timestamptz, timestamptz, uuid)
  from public, anon, authenticated;

-- ── 2. Doanh thu (daily_revenue, SCRUM-39/40) ────────────────────────────────────────────────
-- An open declaration and the close of the ca are the two events the owner is accountable for; the
-- head of the branch is told as well, and whoever of the two performed the action is not.

create or replace function public.notify_revenue_opened()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_organization uuid := coalesce(
    new.organization_id, public.branch_organization(new.branch_id)
  );
  v_recipients uuid[];
begin
  v_recipients := public.without_user(
    public.organization_owner_ids(v_organization) || public.branch_manager_ids(new.branch_id),
    v_actor
  );

  perform public.notify_users(
    v_recipients,
    'Khai báo doanh thu đầu ca',
    format(
      '%s đã khai báo doanh thu đầu ca tại %s: %s đ.',
      public.notification_actor_name(v_actor),
      public.notification_branch_name(new.branch_id),
      public.notification_amount_label(new.open_amount)
    ),
    'REVENUE_OPENED',
    'revenue',
    new.id
  );

  return null;
end;
$$;

drop trigger if exists daily_revenue_notify_opened on public.daily_revenue;
create trigger daily_revenue_notify_opened
  after insert on public.daily_revenue
  for each row execute function public.notify_revenue_opened();

-- The first close of a row is the event; a later edit of an already closed declaration is a
-- correction and must not re-ring the bell (the audit trail on the row records it instead).
create or replace function public.notify_revenue_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_organization uuid := coalesce(
    new.organization_id, public.branch_organization(new.branch_id)
  );
  v_recipients uuid[];
  v_difference numeric := coalesce(new.close_amount, 0) - new.open_amount;
  v_difference_label text;
begin
  if old.closed_at is not null or new.closed_at is null then
    return null;
  end if;

  v_recipients := public.without_user(
    public.organization_owner_ids(v_organization) || public.branch_manager_ids(new.branch_id),
    v_actor
  );

  v_difference_label := public.notification_amount_label(abs(v_difference));

  if v_difference = 0 then
    perform public.notify_users(
      v_recipients,
      'Chốt doanh thu cuối ca',
      format(
        '%s đã chốt ca tại %s: %s đ (khớp với đầu ca).',
        public.notification_actor_name(v_actor),
        public.notification_branch_name(new.branch_id),
        public.notification_amount_label(new.close_amount)
      ),
      'REVENUE_CLOSED',
      'revenue',
      new.id
    );
  else
    -- A lệch figure is the one number a chủ sở hữu always wants to see, so it gets its own type
    -- (and its own icon) instead of hiding inside the ordinary close.
    perform public.notify_users(
      v_recipients,
      'Doanh thu cuối ca bị lệch',
      format(
        '%s đã chốt ca tại %s: %s đ, %s %s đ so với đầu ca.%s',
        public.notification_actor_name(v_actor),
        public.notification_branch_name(new.branch_id),
        public.notification_amount_label(new.close_amount),
        case when v_difference > 0 then 'thừa' else 'thiếu' end,
        v_difference_label,
        case
          when new.close_note is null or btrim(new.close_note) = '' then ''
          else ' Ghi chú: ' || btrim(new.close_note)
        end
      ),
      'REVENUE_DIFF',
      'revenue',
      new.id
    );
  end if;

  return null;
end;
$$;

drop trigger if exists daily_revenue_notify_closed on public.daily_revenue;
create trigger daily_revenue_notify_closed
  after update on public.daily_revenue
  for each row execute function public.notify_revenue_closed();

-- ── 3. Đơn từ (requests, SCRUM-41/63) ────────────────────────────────────────────────────────
-- A filed đơn goes to the queue's owners: the head of the branch it was filed for, and the
-- organization's chủ sở hữu. The requester is never told about their own submission.

create or replace function public.notify_request_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_organization uuid := coalesce(
    new.organization_id, public.branch_organization(new.branch_id)
  );
  v_recipients uuid[];
begin
  v_recipients := public.without_user(
    public.organization_owner_ids(v_organization) || public.branch_manager_ids(new.branch_id),
    v_actor
  );

  perform public.notify_users(
    v_recipients,
    'Đơn từ mới cần duyệt',
    format(
      '%s đã gửi đơn "%s"%s.',
      public.notification_actor_name(coalesce(new.user_id, v_actor)),
      coalesce(nullif(btrim(new.request_type), ''), 'Đơn'),
      case
        when new.branch_id is null then ''
        else ' cho ' || public.notification_branch_name(new.branch_id)
      end
    ),
    'REQUEST_CREATED',
    'request',
    new.id
  );

  return null;
end;
$$;

drop trigger if exists requests_notify_created on public.requests;
create trigger requests_notify_created
  after insert on public.requests
  for each row execute function public.notify_request_created();

-- Only the *decision* is an event (`PENDING → APPROVED/REJECTED`), so the approver stamping a note
-- afterwards does not notify again.
create or replace function public.notify_request_reviewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_organization uuid := coalesce(
    new.organization_id, public.branch_organization(new.branch_id)
  );
  v_type text;
  v_title text;
  v_verb text;
  v_reason text;
begin
  if new.status is not distinct from old.status
     or coalesce(new.status, '') not in ('APPROVED', 'REJECTED') then
    return null;
  end if;

  if new.status = 'APPROVED' then
    v_type := 'REQUEST_APPROVED';
    v_title := 'Đơn của bạn đã được duyệt';
    v_verb := 'đã duyệt';
  else
    v_type := 'REQUEST_REJECTED';
    v_title := 'Đơn của bạn bị từ chối';
    v_verb := 'đã từ chối';
  end if;

  v_reason := case
    when new.reject_reason is null or btrim(new.reject_reason) = '' then ''
    else ' Lý do: ' || btrim(new.reject_reason) || '.'
  end;

  -- The requester is a *direct* recipient: not filtered for activity (their row may already be
  -- deactivated) and not filtered for being the actor (a chủ sở hữu deciding a legacy đơn of their
  -- own still gets the record with its reason).
  perform public.notify_user(
    new.user_id,
    v_title,
    format(
      '%s %s đơn "%s".%s',
      public.notification_actor_name(v_actor),
      v_verb,
      coalesce(nullif(btrim(new.request_type), ''), 'Đơn'),
      v_reason
    ),
    v_type,
    'request',
    new.id
  );

  -- A manager's decision is also reported to the chủ sở hữu, who is accountable for the queue. An
  -- owner's own decision is not: they just made it, and `without_user` keeps them out of the set.
  if public.normalized_role(
       (select u.role from public.users u where u.id = v_actor)
     ) = 'MANAGER' then
    perform public.notify_users(
      public.without_user(public.organization_owner_ids(v_organization), v_actor),
      'Quản lý đã xử lý đơn từ',
      format(
        '%s %s đơn "%s" của %s.',
        public.notification_actor_name(v_actor),
        v_verb,
        coalesce(nullif(btrim(new.request_type), ''), 'Đơn'),
        public.notification_actor_name(new.user_id)
      ),
      'REQUEST_REVIEWED',
      'request',
      new.id
    );
  end if;

  return null;
end;
$$;

drop trigger if exists requests_notify_reviewed on public.requests;
create trigger requests_notify_reviewed
  after update on public.requests
  for each row execute function public.notify_request_reviewed();

-- ── 4. Xếp ca (shift_assignments, SCRUM-30/63) ───────────────────────────────────────────────
-- The employee is the audience: a ca appears, moves, becomes a day off or disappears, and only they
-- need to hear about it. `employee_id` is a direct recipient — a person who was deactivated after
-- being scheduled keeps their assignment (the screens show it as `(đã nghỉ)`), so an offboarded
-- account may legitimately receive one more message about a ca nobody else can cover.

create or replace function public.notify_shift_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_type text := 'SHIFT_ASSIGNED';
  v_title text := 'Bạn được xếp ca làm việc';
begin
  if new.status = 'LEAVE' then
    v_type := 'SHIFT_LEAVE';
    v_title := 'Bạn được xếp ngày nghỉ';
  elsif new.status = 'CANCELLED' then
    v_type := 'SHIFT_REMOVED';
    v_title := 'Ca làm việc đã bị huỷ';
  end if;

  perform public.notify_user(
    new.employee_id,
    v_title,
    format(
      '%s đã xếp cho bạn %s ngày %s tại %s.',
      public.notification_actor_name(v_actor),
      public.notification_shift_phrase(new.shift_id),
      public.notification_date_label(new.work_date),
      public.notification_branch_name(new.branch_id)
    ),
    v_type,
    'shift_assignment',
    new.id
  );

  return null;
end;
$$;

drop trigger if exists shift_assignments_notify_assigned on public.shift_assignments;
create trigger shift_assignments_notify_assigned
  after insert on public.shift_assignments
  for each row execute function public.notify_shift_assigned();

create or replace function public.notify_shift_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_type text := 'SHIFT_CHANGED';
  v_title text := 'Ca làm việc của bạn đã thay đổi';
  v_body text;
begin
  -- A note-only edit is not a schedule change — the screen already shows the note.
  if old.work_date is not distinct from new.work_date
     and old.shift_id is not distinct from new.shift_id
     and old.branch_id is not distinct from new.branch_id
     and old.status is not distinct from new.status then
    return null;
  end if;

  if new.status = 'CANCELLED' then
    v_type := 'SHIFT_REMOVED';
    v_title := 'Ca làm việc đã bị huỷ';
    v_body := format(
      '%s đã huỷ %s ngày %s của bạn.',
      public.notification_actor_name(v_actor),
      public.notification_shift_phrase(new.shift_id),
      public.notification_date_label(old.work_date)
    );
  elsif new.status = 'LEAVE' then
    v_type := 'SHIFT_LEAVE';
    v_title := 'Ca làm việc đổi thành ngày nghỉ';
    v_body := format(
      '%s đã đổi %s ngày %s thành ngày nghỉ.',
      public.notification_actor_name(v_actor),
      public.notification_shift_phrase(new.shift_id),
      public.notification_date_label(new.work_date)
    );
  else
    v_body := format(
      '%s đã đổi ca của bạn thành %s ngày %s tại %s.',
      public.notification_actor_name(v_actor),
      public.notification_shift_phrase(new.shift_id),
      public.notification_date_label(new.work_date),
      public.notification_branch_name(new.branch_id)
    );
  end if;

  perform public.notify_user(
    new.employee_id, v_title, v_body, v_type, 'shift_assignment', new.id
  );

  -- A ca that moved to another branch brought a person into that branch's roster: its head is told,
  -- because they are the one who covers an absence. The old branch's head is not: the person merely
  -- left their list, which the schedule already shows.
  if old.branch_id is distinct from new.branch_id then
    perform public.notify_users(
      public.without_user(public.branch_manager_ids(new.branch_id), v_actor),
      'Nhân sự được xếp ca tại chi nhánh',
      format(
        '%s được xếp %s ngày %s.',
        public.notification_actor_name(new.employee_id),
        public.notification_shift_phrase(new.shift_id),
        public.notification_date_label(new.work_date)
      ),
      'SHIFT_CHANGED',
      'shift_assignment',
      new.id
    );
  end if;

  return null;
end;
$$;

drop trigger if exists shift_assignments_notify_changed on public.shift_assignments;
create trigger shift_assignments_notify_changed
  after update on public.shift_assignments
  for each row execute function public.notify_shift_changed();

create or replace function public.notify_shift_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  perform public.notify_user(
    old.employee_id,
    'Ca làm việc đã bị xoá',
    format(
      '%s đã xoá %s ngày %s tại %s của bạn.',
      public.notification_actor_name(v_actor),
      public.notification_shift_phrase(old.shift_id),
      public.notification_date_label(old.work_date),
      public.notification_branch_name(old.branch_id)
    ),
    'SHIFT_REMOVED',
    'shift_assignment',
    old.id
  );

  return null;
end;
$$;

drop trigger if exists shift_assignments_notify_removed on public.shift_assignments;
create trigger shift_assignments_notify_removed
  after delete on public.shift_assignments
  for each row execute function public.notify_shift_removed();

-- ── 5. Chấm công (attendance, SCRUM-21/23/68/69) ─────────────────────────────────────────────
-- One trigger, because every event here is a transition of the same row — the shape
-- `attendance_track_worked_time` (SCRUM-69) already uses. The order of the checks matters: a
-- manager's correction replaces the times, so it is handled first and nothing else fires for that
-- statement (the correction *is* the story of the row).
--
-- It is an AFTER trigger on purpose: `check_in_distance_m` is derived by the BEFORE trigger
-- `attendance_compute_distance`, and the geofence check below reads the value as stored.

create or replace function public.notify_attendance_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_organization uuid := coalesce(
    new.organization_id, public.branch_organization(new.branch_id)
  );
  v_branch_name text := public.notification_branch_name(new.branch_id);
  v_employee_name text := public.notification_actor_name(new.employee_id);
  v_shift_phrase text := public.notification_shift_phrase(new.shift_id);
  v_radius integer := (
    select b.attendance_radius from public.branches b where b.id = new.branch_id
  );
  v_managers uuid[];
begin
  v_managers := public.without_user(public.branch_manager_ids(new.branch_id), v_actor);

  if tg_op = 'INSERT' then
    -- Ngoài vùng: the distance and the radius are both stored facts, so this needs no re-derivation.
    if new.check_in_distance_m is not null
       and v_radius is not null
       and new.check_in_distance_m > v_radius then
      perform public.notify_users(
        public.without_user(
          public.organization_owner_ids(v_organization) || public.branch_manager_ids(new.branch_id),
          v_actor
        ),
        'Chấm công ngoài vùng cho phép',
        format(
          '%s vào ca tại %s lúc %s, cách chi nhánh %s m (bán kính cho phép %s m).',
          v_employee_name,
          v_branch_name,
          public.notification_time_label(new.check_in_at),
          new.check_in_distance_m,
          v_radius
        ),
        'ATTENDANCE_OUTSIDE',
        'attendance',
        new.id
      );
    end if;

    if public.notification_is_late(new.check_in_at, new.shift_id) then
      perform public.notify_users(
        v_managers,
        'Nhân viên đi muộn',
        format(
          '%s vào ca %s lúc %s tại %s — muộn hơn giờ bắt đầu.',
          v_employee_name,
          v_shift_phrase,
          public.notification_time_label(new.check_in_at),
          v_branch_name
        ),
        'ATTENDANCE_LATE',
        'attendance',
        new.id
      );
    end if;

    return null;
  end if;

  -- Sửa giờ (SCRUM-23): the manager replaced the times, with a reason. The employee is the audience,
  -- and the row's other columns move as a consequence — so this branch ends the evaluation.
  if new.corrected_at is distinct from old.corrected_at and new.corrected_at is not null then
    perform public.notify_user(
      new.employee_id,
      'Giờ công của bạn đã được sửa',
      format(
        '%s đã sửa giờ công ngày %s tại %s thành %s–%s.%s',
        public.notification_actor_name(new.corrected_by),
        public.notification_date_label(new.work_date),
        v_branch_name,
        public.notification_time_label(new.check_in_at),
        public.notification_time_label(new.check_out_at),
        case
          when new.correction_reason is null or btrim(new.correction_reason) = '' then ''
          else ' Lý do: ' || btrim(new.correction_reason) || '.'
        end
      ),
      'ATTENDANCE_CORRECTED',
      'attendance',
      new.id
    );

    return null;
  end if;

  -- Xác nhận bảng công: closes the loop for the employee ("your record of that day is settled").
  if new.verified_at is distinct from old.verified_at and new.verified_at is not null then
    perform public.notify_user(
      new.employee_id,
      'Bảng công đã được xác nhận',
      format(
        '%s đã xác nhận công %s ngày %s tại %s.',
        public.notification_actor_name(new.verified_by),
        v_shift_phrase,
        public.notification_date_label(new.work_date),
        v_branch_name
      ),
      'ATTENDANCE_VERIFIED',
      'attendance',
      new.id
    );
  end if;

  -- Về sớm: only when the arrival itself was on time — a late arrival who leaves early keeps the
  -- lateness for a manager to correct (`resolveCheckOutStatus`, mirrored in the helper).
  if old.check_out_at is null
     and new.check_out_at is not null
     and public.notification_is_early_leave(new.check_in_at, new.check_out_at, new.shift_id) then
    perform public.notify_users(
      v_managers,
      'Nhân viên về sớm',
      format(
        '%s ra ca lúc %s ngày %s tại %s, sớm hơn giờ kết thúc của %s.',
        v_employee_name,
        public.notification_time_label(new.check_out_at),
        public.notification_date_label(new.work_date),
        v_branch_name,
        v_shift_phrase
      ),
      'ATTENDANCE_EARLY_LEAVE',
      'attendance',
      new.id
    );
  end if;

  -- "Vào ca lại" (SCRUM-68/69): the ca is open again while it is still running, which the head of the
  -- branch wants to know — it is the difference between "về sớm" and "đã quay lại làm".
  if old.check_out_at is not null and new.check_out_at is null then
    perform public.notify_users(
      v_managers,
      'Nhân viên vào ca lại',
      format(
        '%s đã mở lại ca %s ngày %s tại %s.',
        v_employee_name,
        v_shift_phrase,
        public.notification_date_label(new.work_date),
        v_branch_name
      ),
      'ATTENDANCE_RESUMED',
      'attendance',
      new.id
    );
  end if;

  -- Khiếu nại mới: the employee contests a row (usually filed by a manager on their behalf, since the
  -- complaint arrives by phone) — the queue's owners have to act on it.
  if new.complaint is not null and new.complaint is distinct from old.complaint then
    perform public.notify_users(
      public.without_user(
        public.organization_owner_ids(v_organization) || public.branch_manager_ids(new.branch_id),
        v_actor
      ),
      'Khiếu nại bảng công',
      format(
        '%s có khiếu nại cho công ngày %s tại %s: %s',
        v_employee_name,
        public.notification_date_label(new.work_date),
        v_branch_name,
        btrim(new.complaint)
      ),
      'ATTENDANCE_COMPLAINT',
      'attendance',
      new.id
    );
  end if;

  -- Đã xử lý khiếu nại: the employee learns the outcome.
  if old.complaint_status is distinct from new.complaint_status
     and new.complaint_status = 'RESOLVED' then
    perform public.notify_user(
      new.employee_id,
      'Khiếu nại đã được xử lý',
      format(
        '%s đã xử lý khiếu nại công ngày %s tại %s.',
        public.notification_actor_name(new.complaint_resolved_by),
        public.notification_date_label(new.work_date),
        v_branch_name
      ),
      'COMPLAINT_RESOLVED',
      'attendance',
      new.id
    );
  end if;

  return null;
end;
$$;

drop trigger if exists attendance_notify_events on public.attendance;
create trigger attendance_notify_events
  after insert or update on public.attendance
  for each row execute function public.notify_attendance_event();

-- ── 6. Verify ────────────────────────────────────────────────────────────────────────────────
-- 1. Every trigger this script owns must be installed exactly once.
select c.relname as table_name, t.tgname, p.proname as function_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
  and p.proname in (
    'notify_revenue_opened', 'notify_revenue_closed',
    'notify_request_created', 'notify_request_reviewed',
    'notify_shift_assigned', 'notify_shift_changed', 'notify_shift_removed',
    'notify_attendance_event'
  )
order by c.relname, t.tgname;

-- 2. The internal helpers must answer `false` for the API roles (the same rule as SCRUM-70).
select
  p.proname,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'attendance_grace_minutes', 'notification_shift_label', 'notification_shift_window',
    'notification_shift_phrase', 'notification_seconds_of_day',
    'notification_is_late', 'notification_is_early_leave'
  )
order by p.proname;

-- 3. The verdict helpers, checked by hand against the two cases that matter. Both must answer `true`:
--    an 08:00 ca entered at 08:20 is late, and a 17:00 ca left at 16:00 by an on-time arrival is
--    về sớm. (Run it on a database that already has the SCRUM-58 shift catalogue.)
-- select
--   public.notification_is_late(
--     (current_date + time '08:20') at time zone 'Asia/Bangkok',
--     (select id from public.shifts where name = 'Ca sáng' limit 1)
--   ) as late_expected_true,
--   public.notification_is_early_leave(
--     (current_date + time '08:00') at time zone 'Asia/Bangkok',
--     (current_date + time '16:00') at time zone 'Asia/Bangkok',
--     (select id from public.shifts where name = 'Ca sáng' limit 1)
--   ) as early_leave_expected_true;

