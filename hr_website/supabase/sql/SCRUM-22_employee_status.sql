-- SCRUM-22: Trạng thái làm việc nhân viên (live employee status behind GET /api/employee-status).
-- Run this script in Supabase Dashboard > SQL Editor.
--
-- The screen used to read `lib/mock/adminStore.ts`; this script removes that need:
--   * `public.users.is_active` — whether an account still works for the company, because
--     "nghỉ việc" cannot be derived from shifts or attendance.
--   * `public.get_employee_status(...)` — one row per person for one business day, derived from
--     the schedule (`shift_assignments`) and the timesheet (`attendance`). Aggregation lives in
--     the database (see AGENTS.md), and the function is `security invoker`, so the RLS policies
--     of every table it reads still decide what the caller may see.
--
-- The function never writes anything and is idempotent to (re)create.

-- ── 1. Employment state ──────────────────────────────────────────────────────────────────
-- `not null default true` keeps every existing account active; set it to false in the SQL
-- editor (or the dashboard) when someone leaves. A dedicated HR screen for onboarding and
-- offboarding is a separate ticket.
alter table public.users add column if not exists is_active boolean not null default true;

-- ── 2. Status per employee per business day ──────────────────────────────────────────────
-- The business day is Asia/Bangkok (UTC+7), not the server timezone: `current_date` would use
-- UTC and report the wrong day between 00:00 and 07:00 local time.
create or replace function public.get_employee_status(
  p_branch_id uuid default null,
  p_work_date date default null
)
returns table (
  work_date date,
  employee_id uuid,
  full_name text,
  role text,
  branch_id uuid,
  branch_name text,
  status text,
  shift_name text,
  check_in_at timestamptz,
  check_out_at timestamptz,
  check_in_distance_m integer,
  attendance_radius integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with business_day as (
    select coalesce(p_work_date, (now() at time zone 'Asia/Bangkok')::date) as work_date
  ),
  -- One assignment per person for the day. A `LEAVE` row wins over a `SCHEDULED` one so a
  -- day off is never reported as "chưa vào ca".
  day_assignment as (
    select distinct on (sa.employee_id)
      sa.employee_id,
      sa.branch_id,
      sa.shift_id,
      sa.status
    from public.shift_assignments sa
    join business_day bd on sa.work_date = bd.work_date
    order by sa.employee_id,
      case sa.status when 'LEAVE' then 0 when 'SCHEDULED' then 1 else 2 end
  ),
  -- Latest check-in of the day, when there is one.
  day_attendance as (
    select distinct on (a.employee_id)
      a.employee_id,
      a.branch_id,
      a.shift_id,
      a.check_in_at,
      a.check_out_at,
      a.check_in_distance_m
    from public.attendance a
    join business_day bd on a.work_date = bd.work_date
    order by a.employee_id, a.check_in_at desc nulls last
  ),
  resolved as (
    select
      bd.work_date,
      u.id as employee_id,
      u.full_name,
      u.role,
      -- The branch of the check-in in progress, else the branch of the planned shift.
      coalesce(att.branch_id, da.branch_id) as branch_id,
      coalesce(att.shift_id, da.shift_id) as shift_id,
      att.check_in_at,
      att.check_out_at,
      att.check_in_distance_m,
      case
        when not coalesce(u.is_active, true) then 'RESIGNED'
        when att.check_in_at is not null and att.check_out_at is null then 'WORKING'
        when att.check_in_at is not null then 'FINISHED'
        when da.status = 'LEAVE' then 'ON_LEAVE'
        when da.employee_id is not null then 'NOT_STARTED'
        else 'NO_SHIFT'
      end as status
    from business_day bd
    cross join public.users u
    left join day_assignment da on da.employee_id = u.id
    left join day_attendance att on att.employee_id = u.id
  )
  select
    r.work_date,
    r.employee_id,
    r.full_name,
    r.role,
    r.branch_id,
    b.name as branch_name,
    r.status,
    s.name as shift_name,
    r.check_in_at,
    r.check_out_at,
    r.check_in_distance_m,
    b.attendance_radius
  from resolved r
  left join public.branches b on b.id = r.branch_id
  left join public.shifts s on s.id = r.shift_id
  where p_branch_id is null or r.branch_id = p_branch_id
  order by
    case r.status
      when 'WORKING' then 0
      when 'NOT_STARTED' then 1
      when 'ON_LEAVE' then 2
      when 'FINISHED' then 3
      when 'NO_SHIFT' then 4
      else 5
    end,
    r.full_name;
$$;

-- Only a signed-in account may call it (the underlying RLS still filters the rows).
revoke all on function public.get_employee_status(uuid, date) from public;
revoke all on function public.get_employee_status(uuid, date) from anon;
grant execute on function public.get_employee_status(uuid, date) to authenticated;