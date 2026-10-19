-- ============================================================================
-- SCRUM-81 — a new ca cannot be put on a shift whose working time has passed
-- ============================================================================
--
-- The rule: a `SCHEDULED` shift_assignments row may only be **inserted** while its ca is still running or
-- has not started yet, read on the business wall clock (Asia/Bangkok, UTC+7, no DST).
--
-- Why the database and not only the app: `POST /api/schedules` already refuses it
-- (`CreateShiftAssignmentUseCase` → `isShiftAlreadyOver`, `lib/usecases/shiftWindow.ts`), but that guard
-- only sees writers that go through that use case. `public.review_shift_registration()` (SCRUM-23) inserts
-- the assignment itself, approving a swap updates rows, and the dashboard or a future client can write the
-- table directly. The check-in window is only open while the ca runs, so a row written after the fact is a
-- record nobody can ever clock in for — the same reasoning that put the attendance arithmetic in triggers
-- (SCRUM-21/68/69).
--
-- What is judged:
--   * `SCHEDULED` only. `LEAVE` / `CANCELLED` are never refused: a day off is not work, and "they were off
--     that day, log it" has to stay writable after the fact.
--   * a ca with hours only (`start_time` and `end_time` present and different). A template without hours,
--     or the zero-length "Nghỉ", has no window to be over — it is never refused.
--   * the ca's real end: `work_date` + `end_time` read in Asia/Bangkok. A ca whose end is not after its
--     start runs past midnight, so its end lands on the next day (22:00–02:00 checked at 23:00 is fine).
--   * a ca that ends exactly at `now()` counts as over, matching `now >= window.end` in the use case.
--
-- What is deliberately NOT judged: rows that already exist. This is a BEFORE INSERT trigger, so editing or
-- deleting an old row still works — that is how a mistake in the past is corrected — and running this
-- script touches no existing row.
--
-- Back-filling history on purpose (rare, and a decision rather than a mistake): disable the trigger for
-- the statement and turn it straight back on, instead of dropping it.
--   alter table public.shift_assignments disable trigger shift_assignments_block_past;
--   insert into public.shift_assignments (…) values (…);
--   alter table public.shift_assignments enable trigger shift_assignments_block_past;
--
-- No `revoke` is needed on the function, unlike `notify_user` (SCRUM-70): a function returning `trigger`
-- cannot be called as an RPC or from SQL ("trigger functions can only be called as triggers"), so it is not
-- reachable through PostgREST at all.
--
-- Apply by hand: Supabase Dashboard → SQL Editor → paste → Run. Idempotent: re-running replaces the
-- function and re-creates the trigger.

create or replace function public.shift_assignments_block_past()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_start time;
  v_end time;
  v_ends_at timestamptz;
begin
  if new.status is distinct from 'SCHEDULED' then
    return new;
  end if;

  select s.name, s.start_time, s.end_time
    into v_name, v_start, v_end
  from public.shifts s
  where s.id = new.shift_id;

  if v_start is null or v_end is null or v_start = v_end then
    return new;
  end if;

  -- Business time: the work date plus the ca's end, interpreted in Asia/Bangkok (never the server zone).
  v_ends_at := (new.work_date + v_end) at time zone 'Asia/Bangkok';

  -- A ca that ends before it starts runs over midnight, so it ends on the following day.
  if v_end <= v_start then
    v_ends_at := v_ends_at + interval '1 day';
  end if;

  if now() >= v_ends_at then
    -- `23P02` is this rule's own SQLSTATE (not `23514`): the table already has a status CHECK constraint,
    -- and a future value added to `SHIFT_ASSIGNMENT_STATUSES` without a matching constraint must not be
    -- reported to the caller as "the ca has ended" — the SCRUM-62 lesson about a mismatch wearing a costume.
    raise exception
      'Ca “%” ngày % đã kết thúc lúc % nên không thể xếp cho nhân viên nữa.',
      coalesce(v_name, 'không rõ'),
      to_char(new.work_date, 'DD/MM/YYYY'),
      to_char(v_end, 'HH24:MI')
      using errcode = '23P02',
            hint = 'Chọn ca khác hoặc ngày khác; chỉ xếp được ca chưa kết thúc.';
  end if;

  return new;
end;
$$;

comment on function public.shift_assignments_block_past() is
  'SCRUM-81: refuses a new SCHEDULED shift assignment whose ca has already ended (Asia/Bangkok).';

drop trigger if exists shift_assignments_block_past on public.shift_assignments;

create trigger shift_assignments_block_past
  before insert on public.shift_assignments
  for each row
  execute function public.shift_assignments_block_past();

-- ============================================================================
-- Verification
-- ============================================================================

-- 1) The trigger exists and is enabled.
select t.tgname,
       case t.tgenabled
         when 'O' then 'enabled'
         when 'D' then 'DISABLED — re-run the trigger section'
         else t.tgenabled::text
       end as state
from pg_trigger t
where t.tgrelid = 'public.shift_assignments'::regclass
  and not t.tgisinternal
order by t.tgname;

-- 2) Which existing rows the rule would refuse if they were written again. Nothing is modified: this is the
--    same expression the trigger evaluates, so a mistake in the timezone or the overnight case shows here.
select a.work_date,
       s.name as ca,
       to_char(s.start_time, 'HH24:MI') as bat_dau,
       to_char(s.end_time, 'HH24:MI') as ket_thuc,
       case
         when s.start_time is null or s.end_time is null or s.start_time = s.end_time
           then 'không xét (không có giờ)'
         when now() >= (
                ((a.work_date + s.end_time) at time zone 'Asia/Bangkok')
                + case when s.end_time <= s.start_time then interval '1 day' else interval '0' end
              )
           then 'ĐÃ KẾT THÚC — xếp mới sẽ bị chặn'
         else 'còn hiệu lực'
       end as ket_qua
from public.shift_assignments a
join public.shifts s on s.id = a.shift_id
order by a.work_date desc
limit 15;

-- 3) The real thing — run these three lines separately when you want to watch it refuse. The insert is
--    expected to FAIL, so nothing is stored; the rollback is there in case it unexpectedly succeeds.
--
-- begin;
-- insert into public.shift_assignments (employee_id, branch_id, shift_id, work_date, status)
-- select a.employee_id, a.branch_id, a.shift_id,
--        (now() at time zone 'Asia/Bangkok')::date - 7, 'SCHEDULED'
-- from public.shift_assignments a
-- where a.status = 'SCHEDULED'
-- limit 1;
-- rollback;
--
-- Expected: ERROR: Ca “…” ngày … đã kết thúc lúc … nên không thể xếp cho nhân viên nữa. (SQLSTATE 23P02)
-- If it succeeded instead, the trigger is missing or disabled — check step 1 and re-run the trigger section.
