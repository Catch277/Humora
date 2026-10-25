-- ============================================================================
-- SCRUM-83 — what an approved đơn does, and which đơn may be filed at all
-- ============================================================================
--
-- Two rules, both enforced in the database because the app is not the only writer of `requests`
-- (the dashboard can edit the table, and a future client can call PostgREST directly):
--
--   1. `requests_guard_shift_details` (BEFORE INSERT) — a đơn that acts on a day must say which day,
--      and a "Đổi ca" đơn must name the ca and the colleague who takes it. The day may not be in the
--      past: a schedule is a statement about work still to come, exactly like `SCRUM-81`, and a day off
--      requested after the fact is a record nobody can act on.
--      The rule is **INSERT-only** on purpose. A `CHECK` (or an `UPDATE` guard) would also re-judge the
--      đơn rows written before `SCRUM-82` — whose `work_date` is null — and approving one of those would
--      die with a schema error instead of doing anything useful. Rows that already exist are not judged.
--
--   2. `requests_apply_approved_effects` (AFTER UPDATE OF status) — the decision is the event, so this
--      fires on `PENDING → APPROVED` only, and by type:
--
--        * "Nghỉ phép"  → every ca of that employee on that day becomes `LEAVE` (the row keeps its
--          `shift_id`, so the week still shows *which* ca was dropped and `notify_shift_changed`
--          announces "Ca làm việc đổi thành ngày nghỉ" by itself). If the employee holds no row that
--          day, one is created on the organization's zero-length "Nghỉ" template (SCRUM-58) — a day off
--          is then visible in the schedule and `shift_conflict_reason()` refuses to schedule over it.
--          `LEAVE` is never refused for being in the past, which is what makes "họ đã nghỉ ngày đó, ghi
--          lại" work (the same exemption as `SCRUM-81`).
--
--        * "Đổi ca"    → the ca moves to the chosen colleague in the same transaction. It is re-checked
--          here, never trusted: the requester must still hold that `SCHEDULED` ca, the colleague must
--          still be an active employee of the same branch, the colleague must be free
--          (`shift_conflict_reason()`, SCRUM-23 — the one copy of that rule, and the same function the
--          picker's RPC calls in SCRUM-82), and the ca must not have already ended.
--
--        * anything else → no effect. "Điều chỉnh công" is deliberately *not* auto-applied: hours are
--          payroll data, and they are corrected on `/attendance` ("Sửa giờ"), which carries its own
--          audit trail (`corrected_by` / `correction_reason`) and recomputes `worked_seconds` (SCRUM-69).
--
-- Why a trigger and not a use case: the two writes (the decision and the schedule) have to succeed or
-- fail together. A raised exception rolls the whole statement back, so a swap that cannot be applied
-- leaves the đơn `PENDING` for the manager to read why — which is the honest outcome, and it is how the
-- SCRUM-70/71/72 fan-out already works. It is the same reasoning that put the attendance arithmetic in
-- triggers (SCRUM-21/68/69).
--
-- Who is told: nobody new. `notify_request_reviewed` (SCRUM-71) tells the requester their đơn was
-- decided, and `notify_shift_changed` tells the employee who receives the moved ca. The colleague is
-- deliberately **not** told when the đơn is filed: v1 has no reply step for them, so a message they
-- cannot act on would be noise — they hear about the ca when it becomes theirs.
--
-- SQLSTATEs (all `23Pxx`, a class no built-in condition uses, so nothing is mistaken for something else):
--   23P03 — the day is in the past (SCRUM-81 uses `23P02` for a ca that has ended)
--   23P04 — the swap cannot be applied at approval time
--   23P05 — the đơn is missing the day (or the ca / the colleague) it needs
--
-- Trigger functions cannot be called as RPCs or from SQL ("trigger functions can only be called as
-- triggers"), so — unlike `notify_user` (SCRUM-70) — no `revoke` is needed here.
--
-- Apply by hand: Supabase Dashboard → SQL Editor → paste → Run, **after** SCRUM-82 and before/with the
-- build that ships this feature. Idempotent: re-running replaces the two functions and re-creates the
-- triggers.

-- ── Preconditions ───────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.requests') is null or to_regclass('public.shift_assignments') is null then
    raise exception 'SCRUM-83: run SCRUM-41_request_review.sql and SCRUM-30_schedule.sql first.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'requests' and column_name = 'work_date'
  ) then
    raise exception 'SCRUM-83: run SCRUM-82_request_shift_details.sql first — requests.work_date is missing.';
  end if;

  if not exists (select 1 from pg_proc where proname = 'shift_conflict_reason') then
    raise exception 'SCRUM-83: run SCRUM-23_shift_registration_swap.sql first — public.shift_conflict_reason() is missing.';
  end if;
end $$;

-- ── 1. A new đơn says which day it is about ─────────────────────────────────────────────────
-- Business time is Asia/Bangkok (UTC+7, no DST) — the server zone is not the organization's.
-- `Khác` is free text and keeps the shape it always had: it is the catch-all for anything the three
-- named types do not describe, and demanding a date from it would refuse đơn the operation writes
-- (a note about a customer, a broken machine) which have no day.
create or replace function public.requests_guard_shift_details()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if new.request_type is null
     or new.request_type not in ('Nghỉ phép', 'Đổi ca', 'Điều chỉnh công') then
    return new;
  end if;

  if new.work_date is null then
    raise exception 'Đơn “%” phải có ngày áp dụng.', new.request_type
      using errcode = '23P05',
            hint = 'Chọn ngày bạn muốn nghỉ, đổi ca hoặc điều chỉnh công.';
  end if;

  if new.work_date < v_today then
    raise exception 'Ngày % đã qua nên không thể gửi đơn cho ngày đó.',
      to_char(new.work_date, 'DD/MM/YYYY')
      using errcode = '23P03',
            hint = 'Chỉ gửi được đơn cho hôm nay hoặc những ngày sau.';
  end if;

  if new.request_type = 'Đổi ca'
     and (new.shift_id is null or new.target_employee_id is null) then
    raise exception 'Đơn đổi ca phải có ca cần đổi và đồng nghiệp sẽ nhận ca đó.'
      using errcode = '23P05',
            hint = 'Chọn ca của bạn trong ngày đó, rồi chọn người nhận ca.';
  end if;

  return new;
end;
$$;

comment on function public.requests_guard_shift_details() is
  'SCRUM-83: a new đơn that acts on a day must name that day (and, for đổi ca, the ca and the colleague), and the day may not be in the past (Asia/Bangkok). INSERT only — an existing row is never re-judged.';

drop trigger if exists requests_guard_shift_details on public.requests;

create trigger requests_guard_shift_details
  before insert on public.requests
  for each row
  execute function public.requests_guard_shift_details();

-- ── 2. An approval is what changes the schedule ─────────────────────────────────────────────
-- `security definer` for the same reason `review_shift_registration()` (SCRUM-23) is: the decision was
-- already authorized by the caller's own `requests` UPDATE policy (and by `ReviewRequestUseCase`,
-- which named the branch it heads), and the schedule write is part of that decision. As the table
-- owner the function is not filtered by RLS, so the effect cannot half-happen because of a read scope.
create or replace function public.requests_apply_approved_effects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.shifts;
  v_assignment public.shift_assignments;
  v_requester_name text;
  v_target_name text;
  v_conflict text;
  v_leave_shift_id uuid;
  v_organization_id uuid;
  v_ends_at timestamptz;
  v_actor uuid := coalesce(auth.uid(), new.approver_id);
begin
  -- The decision is the event: an already-approved đơn that is stamped again (a note, a correction)
  -- must not move a ca twice, and a rejection has no effect at all.
  if new.status is distinct from 'APPROVED' or old.status = 'APPROVED' then
    return null;
  end if;

  v_organization_id := coalesce(new.organization_id, public.current_organization_id());

  -- ── Nghỉ phép: the day becomes a day off ───────────────────────────────────────────────────
  if new.request_type = 'Nghỉ phép' then
    -- A đơn filed before SCRUM-82 carries no day: nothing to act on, and the approval still stands.
    if new.work_date is null then
      return null;
    end if;

    select u.full_name into v_requester_name from public.users u where u.id = new.user_id;

    -- Every ca of that day, not just one: a person may hold a morning and an evening ca and a day off
    -- covers the whole day. The row keeps its `shift_id`, so the week table still shows *which* ca was
    -- dropped, and `notify_shift_changed` (SCRUM-71) announces "Ca làm việc đổi thành ngày nghỉ" by
    -- itself. `LEAVE` is never refused for being in the past, which is what keeps "họ đã nghỉ ngày đó,
    -- ghi lại" possible (the SCRUM-81 exemption).
    update public.shift_assignments
       set status = 'LEAVE',
           updated_at = now()
     where employee_id = new.user_id
       and work_date = new.work_date
       and status = 'SCHEDULED';

    -- No row at all that day: write the day off down, so the schedule shows it and
    -- `shift_conflict_reason()` refuses to schedule over it. The template is the organization's
    -- zero-length "Nghỉ" (SCRUM-58). A project that never ran that script keeps the đơn and gets a
    -- `notice` in the Postgres log instead of a failed approval — a missing seed is not the manager's
    -- mistake, and the đơn is the record that matters.
    if not exists (
      select 1
      from public.shift_assignments a
      where a.employee_id = new.user_id
        and a.work_date = new.work_date
    ) then
      if new.branch_id is null then
        raise notice 'SCRUM-83: đơn nghỉ phép % đã duyệt nhưng đơn không còn chi nhánh nên không ghi được ngày nghỉ vào lịch.', new.id;
        return null;
      end if;

      select s.id into v_leave_shift_id
      from public.shifts s
      where s.name = 'Nghỉ'
        and s.organization_id = v_organization_id
      order by s.created_at, s.id
      limit 1;

      if v_leave_shift_id is null then
        raise notice 'SCRUM-83: đơn nghỉ phép % đã duyệt nhưng tổ chức % chưa có ca mẫu "Nghỉ" nên không ghi được ngày nghỉ vào lịch (xem SCRUM-58_shift_catalogue.sql).',
          new.id, v_organization_id;
      else
        insert into public.shift_assignments
          (employee_id, branch_id, shift_id, work_date, status, note, created_by, organization_id)
        values
          (new.user_id, new.branch_id, v_leave_shift_id, new.work_date, 'LEAVE',
           'Nghỉ phép theo đơn đã duyệt', v_actor, v_organization_id);
      end if;
    end if;

    return null;
  end if;

  -- ── Đổi ca: the ca changes hands ───────────────────────────────────────────────────────────
  if new.request_type = 'Đổi ca' then
    select u.full_name into v_requester_name from public.users u where u.id = new.user_id;
    select u.full_name into v_target_name from public.users u where u.id = new.target_employee_id;

    if new.work_date is null or new.shift_id is null or new.target_employee_id is null then
      raise exception 'Đơn đổi ca của % thiếu ngày, ca hoặc người nhận ca nên không thể duyệt.',
        coalesce(v_requester_name, 'nhân viên')
        using errcode = '23P04',
              hint = 'Từ chối đơn và đề nghị nhân viên gửi lại đơn đổi ca có đủ thông tin.';
    end if;

    select * into v_shift from public.shifts s where s.id = new.shift_id;

    if not found then
      raise exception 'Ca cần đổi không còn tồn tại nên không thể duyệt đơn đổi ca của %.',
        coalesce(v_requester_name, 'nhân viên')
        using errcode = '23P04',
              hint = 'Danh mục ca đã thay đổi; đề nghị nhân viên gửi lại đơn với ca khác.';
    end if;

    -- The schedule may have changed while the đơn waited, so the ca must still be the requester's and
    -- still live. `for update` holds the row until the statement ends, so nothing moves in between.
    select * into v_assignment
    from public.shift_assignments a
    where a.employee_id = new.user_id
      and a.work_date = new.work_date
      and a.shift_id = new.shift_id
      and a.status = 'SCHEDULED'
    for update;

    if not found then
      raise exception 'Ca “%” ngày % không còn được xếp cho % nên không thể chuyển cho người khác.',
        coalesce(v_shift.name, 'không rõ'),
        to_char(new.work_date, 'DD/MM/YYYY'),
        coalesce(v_requester_name, 'nhân viên')
        using errcode = '23P04',
              hint = 'Lịch làm việc đã thay đổi kể từ khi đơn được gửi.';
    end if;

    -- Someone already clocked in for that ca: the attendance row points at the requester, so handing the
    -- ca over would leave a timesheet entry on the wrong person. The same check `review_shift_swap()`
    -- (SCRUM-23) makes, for the same reason.
    if exists (
      select 1
      from public.attendance t
      where t.employee_id = v_assignment.employee_id
        and t.work_date = v_assignment.work_date
        and t.shift_id = v_assignment.shift_id
    ) then
      raise exception 'Ca “%” ngày % đã có dữ liệu chấm công nên không thể chuyển cho người khác.',
        coalesce(v_shift.name, 'không rõ'),
        to_char(new.work_date, 'DD/MM/YYYY')
        using errcode = '23P04',
              hint = 'Xoá bản ghi chấm công trước, hoặc từ chối đơn và xếp ca trực tiếp cho đồng nghiệp.';
    end if;

    -- The same rule as `shift_assignments_block_past` (SCRUM-81) on the ca's real end instant: a ca
    -- nobody can clock in for any more cannot be handed over either. Approving *during* the ca is fine —
    -- only a ca that has already ended is refused. The expression is deliberately identical to that
    -- trigger's, overnight case included.
    if v_shift.start_time is not null
       and v_shift.end_time is not null
       and v_shift.start_time <> v_shift.end_time then
      v_ends_at := (new.work_date + v_shift.end_time) at time zone 'Asia/Bangkok';

      if v_shift.end_time <= v_shift.start_time then
        v_ends_at := v_ends_at + interval '1 day';
      end if;

      if now() >= v_ends_at then
        raise exception 'Ca “%” ngày % đã kết thúc lúc % nên không thể chuyển cho người khác.',
          coalesce(v_shift.name, 'không rõ'),
          to_char(new.work_date, 'DD/MM/YYYY'),
          to_char(v_shift.end_time, 'HH24:MI')
          using errcode = '23P04',
                hint = 'Từ chối đơn: ca này đã qua, không còn ai chấm công được cho ca đó nữa.';
      end if;
    end if;

    -- The colleague must be an active staff member of the same branch (SCRUM-63): a ca in a branch they
    -- do not belong to would be invisible to them, so the swap would silently lose the shift rather than
    -- transfer it. This is the hard half of what the picker's RPC offers.
    if not exists (
      select 1
      from public.users u
      where u.id = new.target_employee_id
        and u.branch_id = new.branch_id
        and coalesce(u.is_active, true)
        and upper(coalesce(u.role, '')) = 'EMPLOYEE'
    ) then
      raise exception 'Người nhận ca phải là nhân viên đang làm việc cùng chi nhánh với % nên không thể duyệt đơn đổi ca.',
        coalesce(v_requester_name, 'nhân viên')
        using errcode = '23P04',
              hint = 'Đề nghị nhân viên chọn lại đồng nghiệp cùng chi nhánh rồi gửi lại đơn.';
    end if;

    -- `shift_conflict_reason()` is the one copy of "this person is not free" (SCRUM-23) — the same
    -- function the picker's RPC calls (SCRUM-82), so the list and this check can never disagree. Its own
    -- sentences are English developer text (the RPC layer speaks those), so the caller reads the outcome
    -- here and the hint names the three cases instead of echoing it.
    v_conflict := public.shift_conflict_reason(
      new.target_employee_id, new.work_date, new.shift_id, v_assignment.id
    );

    if v_conflict is not null then
      raise exception 'Không thể chuyển ca cho % ngày %: đồng nghiệp này không còn rảnh trong ca đó.',
        coalesce(v_target_name, 'nhân viên đã chọn'),
        to_char(new.work_date, 'DD/MM/YYYY')
        using errcode = '23P04',
              hint = 'Kiểm tra lại lịch của họ: đã có ca trùng giờ, đã giữ đúng ca này, hoặc đang nghỉ ngày đó.';
    end if;

    -- The move itself. `notify_shift_changed` (SCRUM-71) tells the new holder (and the head of the branch
    -- when the branch changed); the old holder hears about it through `notify_request_reviewed`. The
    -- `unique_violation` handler covers the one case the availability check cannot see: a *cancelled* row
    -- the colleague still holds for the same (ca, day), which the unique index counts but
    -- `shift_conflict_reason()` ignores.
    begin
      update public.shift_assignments
         set employee_id = new.target_employee_id,
             updated_at = now()
       where id = v_assignment.id;
    exception
      when unique_violation then
        raise exception 'Không thể chuyển ca cho % ngày %: đồng nghiệp đã có bản ghi cho ca này trong ngày đó.',
          coalesce(v_target_name, 'nhân viên đã chọn'),
          to_char(new.work_date, 'DD/MM/YYYY')
          using errcode = '23P04',
                hint = 'Chọn đồng nghiệp khác, hoặc xoá bản ghi cũ của họ rồi duyệt lại.';
    end;

    return null;
  end if;

  -- "Điều chỉnh công" và "Khác" have no automatic effect: hours are corrected on /attendance ("Sửa giờ"),
  -- where the audit trail lives (`corrected_by`, `correction_reason`) and `worked_seconds` is recomputed
  -- (SCRUM-69). A đơn records what was asked for; the correction is a separate, attributed action.
  return null;
end;
$$;

comment on function public.requests_apply_approved_effects() is
  'SCRUM-83: what approving a đơn does — "Nghỉ phép" turns the day into LEAVE (a "Nghỉ" row when there is none), "Đổi ca" moves the ca to the chosen colleague after re-checking the schedule. Other types have no automatic effect.';

drop trigger if exists requests_apply_approved_effects on public.requests;

create trigger requests_apply_approved_effects
  after update of status on public.requests
  for each row
  execute function public.requests_apply_approved_effects();

-- ============================================================================
-- Verification
-- ============================================================================

-- 1) Both triggers are installed exactly once and enabled.
select t.tgname,
       case t.tgenabled
         when 'O' then 'enabled'
         when 'D' then 'DISABLED — re-run the trigger section'
         else t.tgenabled::text
       end as state
from pg_trigger t
where t.tgrelid = 'public.requests'::regclass
  and not t.tgisinternal
order by t.tgname;

-- 2) The guard is an invoker function (it reads nothing), the effect is a definer function (it writes the
--    schedule inside the approver's decision). `prosecdef` must be false then true.
select p.proname, p.prosecdef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('requests_guard_shift_details', 'requests_apply_approved_effects')
order by p.proname;

-- 3) The INSERT guard, by hand. Each of the three inserts is expected to FAIL (23P05, 23P03, 23P05) and
--    stores nothing; `rollback` is there in case one unexpectedly succeeds. Replace `<shift>`/`<user>`
--    with real ids from the project.
--
-- begin;
-- insert into public.requests (branch_id, user_id, request_type, title)
-- select b.id, u.id, 'Nghỉ phép', 'Thiếu ngày' from public.branches b, public.users u limit 1;
-- rollback;
--
-- begin;
-- insert into public.requests (branch_id, user_id, request_type, title, work_date)
-- select b.id, u.id, 'Nghỉ phép', 'Ngày đã qua', (now() at time zone 'Asia/Bangkok')::date - 1
-- from public.branches b, public.users u limit 1;
-- rollback;
--
-- begin;
-- insert into public.requests (branch_id, user_id, request_type, title, work_date)
-- select b.id, u.id, 'Đổi ca', 'Thiếu ca và người nhận',
--        (now() at time zone 'Asia/Bangkok')::date + 1
-- from public.branches b, public.users u limit 1;
-- rollback;

-- 4) Read-only: which approved đơn of the project *would* act, and on what. Nothing is modified — this is
--    the same shape the trigger reads, so a wrong date or a missing ca shows up before anyone clicks Duyệt.
select r.request_type,
       to_char(r.work_date, 'DD/MM/YYYY') as ngay,
       r.title,
       s.name as ca,
       target.full_name as nguoi_nhan_ca,
       r.status
from public.requests r
left join public.shifts s on s.id = r.shift_id
left join public.users target on target.id = r.target_employee_id
where r.work_date is not null
order by r.work_date desc, r.updated_at desc
limit 20;

-- ── After running this ──────────────────────────────────────────────────────────────────────
-- 1. Approving a "Nghỉ phép" đơn makes that day `LEAVE` on /schedules (or writes a "Nghỉ" row when the
--    employee had none), and the employee's bell shows "Ca làm việc đổi thành ngày nghỉ".
-- 2. Approving a "Đổi ca" đơn moves the ca to the chosen colleague; when the colleague is no longer free
--    the approval answers `409` with the trigger's sentence and the đơn stays `PENDING`.
-- 3. `POST /api/requests` for a past day answers `400` (the app checks first) — and the database refuses
--    it too, which is the half that covers the dashboard and any future client.


