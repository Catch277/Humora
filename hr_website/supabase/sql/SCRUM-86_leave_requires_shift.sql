-- ============================================================================
-- SCRUM-86 — a “Nghỉ phép” đơn must cover a ca the employee holds that day
-- ============================================================================
--
-- Why
--   SCRUM-83 turns an approved “Nghỉ phép” into `LEAVE` on every ca of that day — and, when the employee
--   held no row at all, it wrote one on the organization's zero-length “Nghỉ” template. That second branch
--   is what put a day off in the week table as a row of its own, which the fixed timetable has no place
--   for: a day off is the marker inside the block of the ca it replaces, and an employee who simply has no
--   ca that day reads “no shift”. The rule is therefore stated where the đơn is created:
--
--     **a “Nghỉ phép” đơn may only name a day on which the employee has a `SCHEDULED` ca.**
--
--   SCRUM-83's effect is untouched — it still marks every ca of the day `LEAVE`, and each row keeps its
--   `shift_id`, so the week still shows *which* ca was dropped. Its “no ca” insert now only covers a
--   legacy/manual row, because this guard refuses such an insert from every client.
--
-- What this script does
--   1. replaces `requests_guard_shift_details()` with the same rules plus the new one (the trigger stays
--      as it is). The rule is INSERT-only, like everything else in that function, so đơn rows written
--      before this script are never re-judged — that is the SCRUM-83 lesson about a schema mismatch
--      wearing the costume of a server bug;
--   2. reports the legacy day-off rows the timetable can no longer draw (`shift_assignments` on a
--      zero-length template). They are kept: `/employee-status` still reads them as `ON_LEAVE`;
--   3. optionally re-applies an already-approved leave đơn whose ca is still `SCHEDULED` (an approval made
--      before SCRUM-83 was applied changed nothing). Guarded, idempotent, and OFF by default;
--   4. verifies the function/trigger and that no new ca-less leave can be stored.
--
-- Why a trigger and not only the use case: the dashboard can insert `requests`, and so can any future
-- client. `CreateRequestUseCase` answers the same sentence first (`requireOwnShiftOnDay`), which is what
-- the caller reads on `/requests`.
--
-- RLS note: the guard stays an **invoker** function, like SCRUM-83 wrote it. The subquery it adds reads
-- `shift_assignments` through the caller's own policies — an `EMPLOYEE` sees their own rows (SCRUM-60/63),
-- a `MANAGER` the organization, and the dashboard (as the table owner) everything. An account that cannot
-- see its own ca cannot file a đơn anyway: `CreateRequestUseCase` answers `403` first for an employee with
-- no branch.
--
-- Prerequisites: SCRUM-30/63 (`shift_assignments`), SCRUM-82 (`requests.work_date`), SCRUM-83 (the guard
-- function this replaces) and SCRUM-84 (the ca hours). Idempotent.
--
-- Apply by hand: Supabase Dashboard → SQL Editor → paste → Run.

-- ── 0. Preconditions ───────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.requests') is null or to_regclass('public.shift_assignments') is null then
    raise exception 'SCRUM-86: run SCRUM-41_request_review.sql and SCRUM-30_schedule.sql first.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'requests' and column_name = 'work_date'
  ) then
    raise exception 'SCRUM-86: run SCRUM-82_request_shift_details.sql first — requests.work_date is missing.';
  end if;

  if not exists (select 1 from pg_proc where proname = 'requests_guard_shift_details') then
    raise exception 'SCRUM-86: run SCRUM-83_request_effects.sql first — public.requests_guard_shift_details() is missing.';
  end if;
end
$$;

-- ── 1. The guard ───────────────────────────────────────────────────────────────────────────────
-- Every rule below is SCRUM-83's and is reproduced verbatim; only the last block is new. Re-writing a
-- function that guards a security-relevant write must never drop a clause — read the previous definition
-- (`select pg_get_functiondef('public.requests_guard_shift_details'::regproc)`) before editing this one.
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

  -- SCRUM-86: the day a leave asks for has to be a day the employee actually works. `SCHEDULED` is exactly
  -- the set SCRUM-83's approval updates, so a ca that is already a day off or cancelled cannot be "nghỉ"
  -- twice; a zero-length “Nghỉ” template is not work and can never be the ca the đơn covers.
  if new.request_type = 'Nghỉ phép' then
    if not exists (
      select 1
      from public.shift_assignments a
      join public.shifts s on s.id = a.shift_id
      where a.employee_id = new.user_id
        and a.work_date = new.work_date
        and a.status = 'SCHEDULED'
        and s.start_time is not null
        and s.end_time is not null
        and s.start_time <> s.end_time
    ) then
      raise exception 'Bạn không có ca nào ngày % nên không thể gửi đơn nghỉ phép.',
        to_char(new.work_date, 'DD/MM/YYYY')
        using errcode = '23P05',
              hint = 'Chọn ngày bạn có ca làm việc. Nếu cần báo nghỉ ngoài lịch, gửi đơn “Khác” để quản lý ghi nhận.';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.requests_guard_shift_details() is
  'SCRUM-83/86: a new đơn that acts on a day must name that day (for đổi ca the ca and the colleague; for nghỉ phép a ca the employee holds that day), and the day may not be in the past (Asia/Bangkok). INSERT only — an existing row is never re-judged.';

-- Recreated only to keep this script idempotent; the definition is SCRUM-83's.
drop trigger if exists requests_guard_shift_details on public.requests;

create trigger requests_guard_shift_details
  before insert on public.requests
  for each row
  execute function public.requests_guard_shift_details();

-- ── 2. Legacy day-off rows (report, do not delete) ────────────────────────────────────────────
-- An approved leave for a day nobody scheduled used to be written on the zero-length “Nghỉ” template.
-- `/schedules` no longer draws that row (a day off is the marker inside a ca's block), so these rows are
-- invisible there — but they are real records: `/employee-status` reads them as `ON_LEAVE`, and the đơn
-- itself is still in the queue. Read the report and decide; nothing below modifies them.
select a.organization_id,
       count(*)                                as day_off_rows,
       count(*) filter (where a.status = 'LEAVE') as leave_rows,
       min(a.work_date)                        as first_day,
       max(a.work_date)                        as last_day
from public.shift_assignments a
join public.shifts s on s.id = a.shift_id
where s.start_time is not null
  and s.end_time is not null
  and s.start_time = s.end_time
group by a.organization_id
order by a.organization_id;

-- ── 3. Optional: re-apply approvals made before SCRUM-83 was installed ───────────────────────
-- SCRUM-83's trigger only fires on PENDING → APPROVED, so a leave approved before the script ran never
-- touched the schedule. Uncomment §3.1, run it with `rollback` to read the row count, then run it again
-- with `commit` if that is the number you expect. It only touches `SCHEDULED` rows on a real ca of the day
-- the đơn names, so it is idempotent.
--
-- begin;
--   update public.shift_assignments a
--      set status = 'LEAVE',
--          updated_at = now()
--     from public.requests r, public.shifts s
--    where r.request_type = 'Nghỉ phép'
--      and r.status = 'APPROVED'
--      and r.work_date = a.work_date
--      and r.user_id = a.employee_id
--      and a.status = 'SCHEDULED'
--      and s.id = a.shift_id
--      and s.start_time is not null
--      and s.end_time is not null
--      and s.start_time <> s.end_time;
-- rollback;  -- swap for `commit;` once the count is the one you expected

-- ============================================================================
-- Verification
-- ============================================================================

-- 1) The function and its trigger. `prosecdef` must be false (invoker, like SCRUM-83) and the trigger must
--    read `enabled`.
select p.proname,
       p.prosecdef,
       t.tgname,
       case t.tgenabled
         when 'O' then 'enabled'
         when 'D' then 'DISABLED — re-run §1'
         else t.tgenabled::text
       end as state
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join pg_trigger t
       on t.tgfoid = p.oid
      and t.tgrelid = 'public.requests'::regclass
      and not t.tgisinternal
where n.nspname = 'public'
  and p.proname = 'requests_guard_shift_details';

-- 2) Approved “Nghỉ phép” đơn whose day still holds a `SCHEDULED` ca — what §3.1 would change. Empty
--    means every approved leave is already on the schedule.
select count(*) as approved_leave_not_applied
from public.requests r
where r.request_type = 'Nghỉ phép'
  and r.status = 'APPROVED'
  and r.work_date is not null
  and exists (
    select 1
    from public.shift_assignments a
    where a.employee_id = r.user_id
      and a.work_date = r.work_date
      and a.status = 'SCHEDULED'
  );

-- 3) The new rule, by hand. Expected to FAIL with `23P05` and store nothing; `rollback` is there in case
--    it unexpectedly succeeds. Replace the day with a date the account below has no ca on.
--
-- begin;
-- insert into public.requests (branch_id, user_id, request_type, title, work_date)
-- select b.id, u.id, 'Nghỉ phép', 'Ngày không có ca',
--        (now() at time zone 'Asia/Bangkok')::date + 7
-- from public.branches b
-- join public.users u on u.branch_id = b.id
-- limit 1;
-- rollback;

-- ── After running this ──────────────────────────────────────────────────────────────────────
-- 1. `POST /api/requests` refuses a “Nghỉ phép” for a day the caller has no ca, with the same sentence the
--    dialog on `/requests` shows.
-- 2. Approving a leave marks that day's ca `LEAVE`, which `/schedules` renders as “Nghỉ” inside the ca's
--    block — an empty cell in the same row is an employee who has no ca that day.
-- 3. No new row is ever written on the zero-length “Nghỉ” template; §2 is the legacy tail to review.

