-- SCRUM-98 (A5): Số liệu tổng hợp cho dashboard nhiều biểu đồ.
-- Run this after SCRUM-21 (attendance), SCRUM-30 (schedule), SCRUM-39/40/44 (revenue),
-- SCRUM-53/60/63 (tenant + read scope) and SCRUM-84 (shift hours).
--
-- The dashboard's four charts (doanh thu · chấm công · nhân sự · chi nhánh) are read from these two
-- functions only, so a figure on the dashboard cannot disagree with the screen it comes from:
--   * `get_dashboard_operations` — one row per (thời gian × chi nhánh): doanh thu đã chốt, số lượt chấm
--     công theo từng trạng thái. Every value is summable, which is what lets the use case build both the
--     time series and the per-branch breakdown from one answer.
--   * `get_dashboard_workforce` — one row per chi nhánh: số tài khoản, số người đi làm trong kỳ và số
--     lượt vắng (ca đã tan mà không có dòng chấm công). These are DISTINCT counts, so they must not be
--     summed across time buckets — that is why they live in their own function.
--
-- Both are `security invoker`: the RLS policies of `users`, `branches`, `daily_revenue`, `attendance`
-- and `shift_assignments` still decide which rows the caller may see (SCRUM-60/63). The branch scope of
-- a chi nhánh trưởng is applied by `GetDashboardStatisticsUseCase`, exactly like `GetEmployeeStatusUseCase`
-- does, because read RLS deliberately lets a manager read the whole organization.
--
-- The revenue filter is copied verbatim from `get_revenue_report` (SCRUM-44): closed declarations only,
-- `close_amount - open_amount`, bucketed in Asia/Bangkok. Do not "simplify" it here — the two numbers
-- have to match. Section 4 below is the query that proves it.

-- ── 1. When does a planned ca end? ───────────────────────────────────────────────────────────────
-- The same inference SCRUM-94 uses for payroll (`payroll_work_lines`) and that
-- `lib/usecases/attendanceAutoClose.ts` uses on the screens: a ca on `work_date` ends at
-- `(work_date + end_time)` in Asia/Bangkok, +24 h for an overnight template
-- (`end_time < start_time`). `null` means "there is no end to infer": a zero-length template
-- (`Nghỉ`, 00:00–00:00) or one written before SCRUM-84 without hours.
create or replace function public.dashboard_shift_end_at(
  p_work_date date,
  p_start_time time,
  p_end_time time
)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case
    when p_work_date is null or p_end_time is null or p_start_time is null then null
    when p_end_time = p_start_time then null
    when p_end_time < p_start_time
      then ((p_work_date + 1) + p_end_time) at time zone 'Asia/Bangkok'
    else (p_work_date + p_end_time) at time zone 'Asia/Bangkok'
  end;
$$;

-- ── 2. Operations per bucket per branch ─────────────────────────────────────────────────────────
create or replace function public.get_dashboard_operations(
  p_branch_id uuid default null,
  p_start_date date default null,
  p_end_date date default null,
  p_bucket text default 'day'
)
returns table (
  bucket_start timestamptz,
  branch_id uuid,
  branch_name text,
  revenue_amount numeric,
  revenue_records bigint,
  attendance_total bigint,
  on_time bigint,
  late bigint,
  early_leave bigint,
  absent bigint,
  incomplete bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
-- `branch_id` is both an OUT parameter of this function and a column of every CTE below. plpgsql
-- resolves an unqualified name against the *variable* first, which raises 42702 ("column reference
-- branch_id is ambiguous"); this pragma makes the column win, and the parameters are always written
-- with their own `p_` / `v_` names.
declare
  -- `current_date` would use UTC and report yesterday between 00:00 and 07:00 local time.
  v_start_date date := coalesce(p_start_date, (now() at time zone 'Asia/Bangkok')::date);
  v_end_date date := coalesce(
    p_end_date,
    p_start_date,
    (now() at time zone 'Asia/Bangkok')::date
  );
  v_start_at timestamptz;
  v_end_at timestamptz;
begin
  if p_bucket not in ('day', 'month') then
    raise exception 'Unsupported dashboard bucket: %', p_bucket;
  end if;

  if v_end_date < v_start_date then
    raise exception 'The dashboard range ends before it starts: % .. %', v_start_date, v_end_date;
  end if;

  -- Asia/Bangkok is UTC+7 and does not observe daylight saving time.
  v_start_at := v_start_date::timestamp at time zone 'Asia/Bangkok';
  v_end_at := (v_end_date + 1)::timestamp at time zone 'Asia/Bangkok';
  return query
  with revenue as (
    select
      (
        date_trunc(p_bucket, dr.created_at at time zone 'Asia/Bangkok')
        at time zone 'Asia/Bangkok'
      ) as bucket_start,
      dr.branch_id,
      sum(dr.close_amount - dr.open_amount) as revenue_amount,
      count(*)::bigint as revenue_records
    from public.daily_revenue dr
    where dr.created_at >= v_start_at
      and dr.created_at < v_end_at
      and dr.close_amount is not null
      and (p_branch_id is null or dr.branch_id = p_branch_id)
    group by 1, 2
  ),
  -- Buckets come from `work_date` (a business date), so a ca is counted on the day it belongs to even
  -- when its check-in is stored late at night in UTC.
  attendance as (
    select
      (
        date_trunc(p_bucket, a.work_date::timestamp)
        at time zone 'Asia/Bangkok'
      ) as bucket_start,
      a.branch_id,
      count(*)::bigint as attendance_total,
      count(*) filter (where a.status = 'ON_TIME')::bigint as on_time,
      count(*) filter (where a.status = 'LATE')::bigint as late,
      count(*) filter (where a.status = 'EARLY_LEAVE')::bigint as early_leave,
      count(*) filter (where a.status = 'ABSENT')::bigint as absent,
      count(*) filter (where a.status = 'INCOMPLETE')::bigint as incomplete
    from public.attendance a
    where a.work_date >= v_start_date
      and a.work_date <= v_end_date
      and (p_branch_id is null or a.branch_id = p_branch_id)
    group by 1, 2
  ),
  merged as (
    select
      r.bucket_start,
      r.branch_id,
      r.revenue_amount,
      r.revenue_records,
      0::bigint as attendance_total,
      0::bigint as on_time,
      0::bigint as late,
      0::bigint as early_leave,
      0::bigint as absent,
      0::bigint as incomplete
    from revenue r
    union all
    select
      t.bucket_start,
      t.branch_id,
      0::numeric as revenue_amount,
      0::bigint as revenue_records,
      t.attendance_total,
      t.on_time,
      t.late,
      t.early_leave,
      t.absent,
      t.incomplete
    from attendance t
  )
  select
    m.bucket_start,
    m.branch_id,
    b.name as branch_name,
    sum(m.revenue_amount) as revenue_amount,
    -- `sum(bigint)` answers `numeric`, so every count is cast back to the declared `bigint` —
    -- `return query` refuses a column whose type does not match the OUT parameter exactly.
    sum(m.revenue_records)::bigint as revenue_records,
    sum(m.attendance_total)::bigint as attendance_total,
    sum(m.on_time)::bigint as on_time,
    sum(m.late)::bigint as late,
    sum(m.early_leave)::bigint as early_leave,
    sum(m.absent)::bigint as absent,
    sum(m.incomplete)::bigint as incomplete
  from merged m
  left join public.branches b on b.id = m.branch_id
  group by m.bucket_start, m.branch_id, b.name
  order by m.bucket_start, b.name nulls last;
end;
$$;
-- ── 3. Workforce + vắng within the range ────────────────────────────────────────────────────────
create or replace function public.get_dashboard_workforce(
  p_branch_id uuid default null,
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  branch_id uuid,
  branch_name text,
  employee_total bigint,
  employee_active bigint,
  employee_resigned bigint,
  scheduled_total bigint,
  no_show_total bigint,
  working_employees bigint,
  absent_employees bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
-- The same pragma as `get_dashboard_operations`: every OUT parameter (`branch_id`, `on_time`, …) is
-- also a column name below, and an unqualified reference would raise 42702.
declare
  v_start_date date := coalesce(p_start_date, (now() at time zone 'Asia/Bangkok')::date);
  v_end_date date := coalesce(
    p_end_date,
    p_start_date,
    (now() at time zone 'Asia/Bangkok')::date
  );
begin
  if v_end_date < v_start_date then
    raise exception 'The dashboard range ends before it starts: % .. %', v_start_date, v_end_date;
  end if;

  return query
  with employees as (
    select
      u.branch_id,
      count(*)::bigint as employee_total,
      count(*) filter (where coalesce(u.is_active, true))::bigint as employee_active,
      count(*) filter (where not coalesce(u.is_active, true))::bigint as employee_resigned
    from public.users u
    where p_branch_id is null or u.branch_id = p_branch_id
    group by u.branch_id
  ),
  scheduled as (
    select sa.branch_id, count(*)::bigint as scheduled_total
    from public.shift_assignments sa
    where sa.work_date between v_start_date and v_end_date
      and sa.status = 'SCHEDULED'
      and (p_branch_id is null or sa.branch_id = p_branch_id)
    group by sa.branch_id
  ),
  -- A no-show = a planned ca whose end has passed and that has no attendance row at all. The stored
  -- ABSENT status (a manager's correction) is counted in `get_dashboard_operations` instead, so the two
  -- can never describe the same employee-day twice.
  no_shows as (
    select
      sa.branch_id,
      count(*)::bigint as no_show_total,
      count(distinct sa.employee_id)::bigint as absent_employees
    from public.shift_assignments sa
    join public.shifts s on s.id = sa.shift_id
    where sa.work_date between v_start_date and v_end_date
      and sa.status = 'SCHEDULED'
      and (p_branch_id is null or sa.branch_id = p_branch_id)
      and public.dashboard_shift_end_at(sa.work_date, s.start_time, s.end_time) is not null
      and public.dashboard_shift_end_at(sa.work_date, s.start_time, s.end_time) < now()
      and not exists (
        select 1
        from public.attendance a
        where a.employee_id = sa.employee_id
          and a.work_date = sa.work_date
      )
    group by sa.branch_id
  ),
  working as (
    select a.branch_id, count(distinct a.employee_id)::bigint as working_employees
    from public.attendance a
    where a.work_date between v_start_date and v_end_date
      -- An `ABSENT` row is a manager's decision that the person did not come in, so it must not make
      -- them "đi làm" just because a row exists.
      and a.status <> 'ABSENT'
      and (p_branch_id is null or a.branch_id = p_branch_id)
    group by a.branch_id
  ),
  branch_rows as (
    select b.id as branch_id, b.name as branch_name
    from public.branches b
    where p_branch_id is null or b.id = p_branch_id
  ),
  -- Every branch appears, even one with no employee and no ca in the range: a chart that silently drops
  -- a quiet branch would read as "this branch does not exist". The `null` branch is the owner's
  -- "chưa gán chi nhánh" bucket (a manager never sees it: the use case drops it outside their scope).
  branch_keys as (
    select br_in.branch_id from branch_rows br_in
    union
    select e_in.branch_id from employees e_in
    union
    select sc_in.branch_id from scheduled sc_in
    union
    select ns_in.branch_id from no_shows ns_in
    union
    select w_in.branch_id from working w_in
  )
  select
    k.branch_id,
    br.branch_name,
    coalesce(e.employee_total, 0) as employee_total,
    coalesce(e.employee_active, 0) as employee_active,
    coalesce(e.employee_resigned, 0) as employee_resigned,
    coalesce(sc.scheduled_total, 0) as scheduled_total,
    coalesce(ns.no_show_total, 0) as no_show_total,
    coalesce(w.working_employees, 0) as working_employees,
    coalesce(ns.absent_employees, 0) as absent_employees
  from branch_keys k
  left join branch_rows br on br.branch_id = k.branch_id
  left join employees e on e.branch_id is not distinct from k.branch_id
  left join scheduled sc on sc.branch_id is not distinct from k.branch_id
  left join no_shows ns on ns.branch_id is not distinct from k.branch_id
  left join working w on w.branch_id is not distinct from k.branch_id
  order by br.branch_name nulls last;
end;
$$;

-- Only a signed-in account may call these (the underlying RLS still filters the rows).
revoke all on function public.dashboard_shift_end_at(date, time, time) from public;
revoke all on function public.dashboard_shift_end_at(date, time, time) from anon;
revoke all on function public.get_dashboard_operations(uuid, date, date, text) from public;
revoke all on function public.get_dashboard_operations(uuid, date, date, text) from anon;
revoke all on function public.get_dashboard_workforce(uuid, date, date) from public;
revoke all on function public.get_dashboard_workforce(uuid, date, date) from anon;
grant execute on function public.get_dashboard_operations(uuid, date, date, text) to authenticated;
grant execute on function public.get_dashboard_workforce(uuid, date, date) to authenticated;

-- ── 4. Verification (read-only; runs after the definitions above) ───────────────────────────────
-- 4.1 The two revenue paths must agree to the cent for the same 30-day window. If they do not, this
--     script's filter drifted from `get_revenue_report` — fix the filter, never the report.
with bounds as (
  select
    ((now() at time zone 'Asia/Bangkok')::date - 29) as start_date,
    (now() at time zone 'Asia/Bangkok')::date as end_date
)
select
  coalesce(
    (
      select sum(o.revenue_amount)
      from bounds b,
        lateral public.get_dashboard_operations(null, b.start_date, b.end_date, 'day') o
    ),
    0
  ) as dashboard_revenue,
  coalesce(
    (
      select sum(r.total_revenue_amount)
      from bounds b,
        lateral public.get_revenue_report(
          null,
          b.start_date::timestamp at time zone 'Asia/Bangkok',
          (b.end_date + 1)::timestamp at time zone 'Asia/Bangkok',
          'day'
        ) r
    ),
    0
  ) as report_revenue;

-- 4.2 One row per branch: `no_show_total` counts only ca đã tan mà không có dòng chấm công, and
--     `working_employees` is a distinct count over the whole window (never a sum of daily counts).
select *
from public.get_dashboard_workforce(
  null,
  ((now() at time zone 'Asia/Bangkok')::date - 29),
  (now() at time zone 'Asia/Bangkok')::date
);
