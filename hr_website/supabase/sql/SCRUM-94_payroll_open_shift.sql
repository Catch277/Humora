-- SCRUM-94: A ca nobody closed counts up to the ca's end time in the payroll math.
-- Run this script in Supabase Dashboard > SQL Editor, AFTER SCRUM-90_payroll.sql (and after SCRUM-93 for the
-- final-salary chip, which reads the same function).
--
-- The bug this repairs: `payroll_work_lines` filtered `and a.check_out_at is not null`, so a row whose
-- "Ra ca" click never happened was not merely skipped — it was invisible. The generator counts the rows that
-- function returns, so an employee whose ca all lack a check-out produced `counted = 0, skipped = 0`, and
-- `generate_payslips` took its "nothing worked this month" branch and created no draft, even though
-- /attendance showed the hours (the screen already applies the fallback of SCRUM-75). Two numbers disagreed
-- about the same month: 4,8 h on the timesheet, "no payslip" on payroll.
--
-- What this script does: the same rule the screens apply, computed in SQL so money and screen cannot drift —
-- a missing giờ ra reads as the ca's `end_time` once that instant has passed, on top of the seconds already
-- banked by the SCRUM-69 trigger. Nothing is written to `attendance`: `check_out_at` stays null (so a manager
-- can still correct it with who and why), and no scheduled job is needed — the inference is a read-time
-- rule, exactly like `lib/usecases/attendanceAutoClose.ts`.
--
-- Three cases deliberately stay unpaid, and each says why in `skip_reason`:
--   * `NO_SHIFT`   — no ca template (an unscheduled "Ngoài lịch" check-in), so there is no end to infer;
--   * `OPEN_SHIFT` — the ca has not ended yet, so the employee may still press "Ra ca";
--   * `NO_TIME`    — inferred or banked, but under a minute.
-- A row re-opened after its ca had already ended keeps its banked seconds and is not invented an end (the
-- current segment never overlapped the ca) — the same guard `autoCheckOutAt` applies.
--
-- Applied by hand; idempotent: safe to re-run.

-- ── 0. Preconditions ─────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.attendance') is null
    or to_regclass('public.pay_profiles') is null
    or to_regclass('public.shifts') is null then
    raise exception 'SCRUM-94: run SCRUM-90_payroll.sql first (attendance, pay_profiles, shifts).';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'attendance' and column_name = 'worked_seconds'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'attendance' and column_name = 'resumed_at'
  ) then
    raise exception 'SCRUM-94: run SCRUM-69_attendance_worked_time.sql first (attendance.worked_seconds, attendance.resumed_at).';
  end if;
end $$;

-- ── 1. The one place hours become money ──────────────────────────────────────────────────
-- Kept identical to SCRUM-90's function in signature and result shape (the generator and `my_pay_estimate`
-- both call it), with the inferred checkout added:
--
--   effective_seconds =
--     check_out_at is not null                       → worked_seconds            (a real click wins)
--     ca ended, and the open segment began before it → worked_seconds + (end − segment start)
--     otherwise                                      → worked_seconds            (banked only)
--
-- `segment start` is `coalesce(resumed_at, check_in_at)`: after "Vào ca lại" the current segment starts at
-- `resumed_at`, and the seconds before the pause are already inside `worked_seconds`.
create or replace function public.payroll_work_lines(p_employee_id uuid, p_start date, p_end date)
returns table (
  attendance_id uuid,
  work_date date,
  shift_name text,
  minutes integer,
  is_overtime boolean,
  hourly_rate bigint,
  multiplier numeric,
  amount bigint,
  counted boolean,
  skip_reason text
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      a.id as attendance_id,
      a.work_date,
      s.name as shift_name,
      a.status,
      a.worked_seconds,
      a.check_in_at,
      a.check_out_at,
      (coalesce(s.is_overtime, false) or s.name like 'Tăng ca%' or s.name like 'tăng ca%') as is_overtime,
      case
        when s.id is null or s.start_time is null or s.end_time is null then null
        else greatest(0, extract(epoch from (
          case when s.end_time >= s.start_time
            then s.end_time - s.start_time
            else s.end_time - s.start_time + interval '24 hours'
          end
        ))::integer)
      end as cap_seconds,
      -- The instant the ca ends, on the Bangkok wall clock: `work_date + end_time` is a Bangkok local
      -- timestamp and `at time zone` turns it into the UTC instant. An overnight template (22:00–06:00) ends
      -- on the next day; a zero-length template (`Nghỉ`) has no end and answers null, which keeps a day off
      -- out of this rule entirely.
      case
        when s.id is null or s.start_time is null or s.end_time is null then null
        when s.end_time = s.start_time then null
        else ((a.work_date + s.end_time) at time zone 'Asia/Bangkok')
          + case when s.end_time < s.start_time then interval '24 hours' else interval '0' end
      end as shift_end_at,
      coalesce(a.resumed_at, a.check_in_at) as segment_start,
      p.hourly_rate,
      p.overtime_multiplier
    from public.attendance a
    left join public.shifts s on s.id = a.shift_id
    left join lateral (
      select pp.hourly_rate, pp.overtime_multiplier
      from public.pay_profiles pp
      where pp.employee_id = a.employee_id and pp.effective_from <= a.work_date
      order by pp.effective_from desc
      limit 1
    ) p on true
    where a.employee_id = p_employee_id
      and a.work_date between p_start and p_end
      and a.check_in_at is not null
  ),
  timed as (
    select b.*,
      case
        when b.check_out_at is not null then b.worked_seconds
        when b.shift_end_at is not null
          and b.shift_end_at <= now()
          and b.shift_end_at > b.segment_start
          then b.worked_seconds
            + greatest(0, floor(extract(epoch from (b.shift_end_at - b.segment_start))))::integer
        else b.worked_seconds
      end as effective_seconds
    from base b
  ),
  judged as (
    select t.*,
      case
        when t.status = 'ABSENT' then 'ABSENT'
        when t.cap_seconds is null then 'NO_SHIFT'
        when t.hourly_rate is null then 'NO_PAY_PROFILE'
        when least(t.effective_seconds, t.cap_seconds) >= 60 then null
        -- Under a minute: say which kind of "nothing" this is, because a reviewer only sees a count.
        when t.check_out_at is null and t.shift_end_at is not null and t.shift_end_at > now()
          then 'OPEN_SHIFT'
        else 'NO_TIME'
      end as skip_reason
    from timed t
  )
  select
    j.attendance_id,
    j.work_date,
    j.shift_name,
    case when j.skip_reason is null then least(j.effective_seconds, j.cap_seconds) / 60 else 0 end,
    j.is_overtime,
    coalesce(j.hourly_rate, 0)::bigint,
    case when j.is_overtime then coalesce(j.overtime_multiplier, 1) else 1 end::numeric,
    case when j.skip_reason is null
      then round(
        (least(j.effective_seconds, j.cap_seconds) / 60)::numeric
        * j.hourly_rate
        * (case when j.is_overtime then j.overtime_multiplier else 1 end)
        / 60
      )::bigint
      else 0
    end,
    (j.skip_reason is null),
    j.skip_reason
  from judged j
  order by j.work_date, j.shift_name;
$$;

-- ── 2. Function privileges ───────────────────────────────────────────────────────────────
-- Unchanged from SCRUM-90: an internal helper, callable only from the definer functions.
revoke all on function public.payroll_work_lines(uuid, date, date) from public, anon, authenticated;

-- ── 3. Quick check (read-only) ───────────────────────────────────────────────────────────
-- Expect: `open_rows` > 0 on a project where somebody forgot to clock out, and `counted_rows` > 0 for the
-- same employee once the ca has ended — the two numbers that used to be 0 and 0 and produced no draft.
-- select count(*) filter (where a.check_out_at is null) as open_rows,
--        count(*) as all_rows
-- from public.attendance a
-- where a.work_date >= date_trunc('month', (now() at time zone 'Asia/Bangkok')::date)::date
--   and a.check_in_at is not null;
--
-- Per employee, as the generator sees them (run one at a time, replacing the id):
-- select * from public.payroll_work_lines('<employee uuid>', date_trunc('month', current_date)::date,
--   (date_trunc('month', current_date) + interval '1 month - 1 day')::date);
