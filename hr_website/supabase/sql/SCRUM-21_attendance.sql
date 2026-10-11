-- SCRUM-21 / SCRUM-22 / SCRUM-29: Bảng công (attendance records behind GET /api/attendance,
-- POST /api/attendance/complaints and PATCH /api/attendance/{id}/verify).
-- Run this script in Supabase Dashboard > SQL Editor.
--
-- This table is new (no attendance table existed in the project before this ticket), so the
-- script creates it plus its constraints, indexes, RLS policies and the self-update guard.
--
-- Division of labour: check-in / check-out happen in the mobile app (`hr_mobile_app`), which
-- inserts the GPS point and the verification photo. The web app is the review side (validity,
-- ảnh xác minh, khiếu nại) — it never creates a record, but it may verify one.

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.users (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  -- The scheduled shift this record belongs to; null when someone worked unscheduled.
  shift_id uuid references public.shifts (id) on delete set null,
  work_date date not null,
  check_in_at timestamptz,
  check_out_at timestamptz,
  check_in_latitude double precision,
  check_in_longitude double precision,
  check_out_latitude double precision,
  check_out_longitude double precision,
  -- Metres between the check-in point and the branch centre. Recomputed by
  -- `attendance_compute_distance` from the coordinates below, so a client cannot store a
  -- distance that disagrees with them.
  check_in_distance_m integer,
  check_in_photo_url text,
  check_out_photo_url text,
  status text not null default 'ON_TIME',
  note text,
  -- Khiếu nại của nhân viên (SCRUM-29) and the manager's decision on the record.
  complaint text,
  complaint_at timestamptz,
  verified_by uuid references public.users (id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.attendance add column if not exists employee_id uuid;
alter table public.attendance add column if not exists branch_id uuid;
alter table public.attendance add column if not exists shift_id uuid;
alter table public.attendance add column if not exists work_date date;
alter table public.attendance add column if not exists check_in_at timestamptz;
alter table public.attendance add column if not exists check_out_at timestamptz;
alter table public.attendance add column if not exists check_in_latitude double precision;
alter table public.attendance add column if not exists check_in_longitude double precision;
alter table public.attendance add column if not exists check_out_latitude double precision;
alter table public.attendance add column if not exists check_out_longitude double precision;
alter table public.attendance add column if not exists check_in_distance_m integer;
alter table public.attendance add column if not exists check_in_photo_url text;
alter table public.attendance add column if not exists check_out_photo_url text;
alter table public.attendance add column if not exists status text not null default 'ON_TIME';
alter table public.attendance add column if not exists note text;
alter table public.attendance add column if not exists complaint text;
alter table public.attendance add column if not exists complaint_at timestamptz;
alter table public.attendance add column if not exists verified_by uuid;
alter table public.attendance add column if not exists verified_at timestamptz;
alter table public.attendance add column if not exists created_at timestamptz not null default now();
alter table public.attendance add column if not exists updated_at timestamptz not null default now();

-- Values mirror ATTENDANCE_STATUSES in lib/domain/entities/Attendance.ts.
alter table public.attendance drop constraint if exists attendance_status_check;
alter table public.attendance add constraint attendance_status_check
  check (status in ('ON_TIME', 'LATE', 'EARLY_LEAVE', 'ABSENT', 'INCOMPLETE'));

alter table public.attendance drop constraint if exists attendance_distance_check;
alter table public.attendance add constraint attendance_distance_check
  check (check_in_distance_m is null or check_in_distance_m >= 0);

-- A shift cannot end before it started, whatever the device clock said.
alter table public.attendance drop constraint if exists attendance_period_check;
alter table public.attendance add constraint attendance_period_check
  check (
    check_in_at is null
    or check_out_at is null
    or check_out_at >= check_in_at
  );

-- One record per employee, per shift, per day. Postgres treats NULLs as distinct, so
-- unscheduled records (shift_id is null) are not covered by this index — the app prevents
-- those duplicates with the same (employee, work_date) filter it uses for scheduled ones.
create unique index if not exists attendance_employee_shift_day_idx
  on public.attendance (employee_id, work_date, shift_id);

-- The Bảng công screen reads by day, by branch+day, by employee+day and by status.
create index if not exists attendance_work_date_idx on public.attendance (work_date);
create index if not exists attendance_branch_work_date_idx
  on public.attendance (branch_id, work_date);
create index if not exists attendance_employee_work_date_idx
  on public.attendance (employee_id, work_date);
create index if not exists attendance_status_idx on public.attendance (status);

-- ── Row level security ────────────────────────────────────────────────────────────────────
alter table public.attendance enable row level security;

-- Every signed-in account may read the timesheet (the Bảng công screen and quick search both
-- show it); a narrower, branch-scoped policy would need a branch membership model that does
-- not exist yet.
drop policy if exists attendance_select_authenticated on public.attendance;
create policy attendance_select_authenticated on public.attendance
  for select
  to authenticated
  using (true);

-- The mobile app records your own check-in only.
drop policy if exists attendance_insert_own on public.attendance;
create policy attendance_insert_own on public.attendance
  for insert
  to authenticated
  with check (employee_id = auth.uid());

-- An employee may complete their own record (check out, note, complaint) — the trigger below
-- stops them from editing the check-in facts they already submitted.
drop policy if exists attendance_update_own on public.attendance;
create policy attendance_update_own on public.attendance
  for update
  to authenticated
  using (employee_id = auth.uid())
  with check (employee_id = auth.uid());

-- OWNER / CHU may correct or verify any record of the branches they manage.
drop policy if exists attendance_update_managers on public.attendance;
create policy attendance_update_managers on public.attendance
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and upper(u.role) in ('OWNER', 'CHU')
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and upper(u.role) in ('OWNER', 'CHU')
    )
  );

-- The stored distance must agree with the stored coordinates: a client could otherwise send a
-- check-in point 3 km away with `distance_m = 5` and look valid. This trigger recomputes the
-- distance from that point and the branch centre (haversine, metres) on every write, so the
-- value the screens trust is always derived from the data stored next to it.
-- The coordinates themselves remain whatever the device measured — the server has no
-- independent position, and that limitation is called out in AGENTS.md.
create or replace function public.attendance_compute_distance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  branch_lat double precision;
  branch_lng double precision;
  earth_radius constant double precision := 6371000;
  delta_lat double precision;
  delta_lng double precision;
  haversine double precision;
begin
  select b.latitude, b.longitude
    into branch_lat, branch_lng
  from public.branches b
  where b.id = new.branch_id;

  if new.check_in_latitude is null
    or new.check_in_longitude is null
    or branch_lat is null
    or branch_lng is null
  then
    new.check_in_distance_m := null;
    return new;
  end if;

  delta_lat := radians(new.check_in_latitude - branch_lat);
  delta_lng := radians(new.check_in_longitude - branch_lng);

  haversine := sin(delta_lat / 2) ^ 2
    + cos(radians(branch_lat))
      * cos(radians(new.check_in_latitude))
      * sin(delta_lng / 2) ^ 2;

  new.check_in_distance_m := round(2 * earth_radius * asin(least(1, sqrt(haversine))));

  return new;
end;
$$;

drop trigger if exists attendance_compute_distance on public.attendance;
create trigger attendance_compute_distance
  before insert or update on public.attendance
  for each row execute function public.attendance_compute_distance();

-- ── Check-in integrity ────────────────────────────────────────────────────────────────────
-- RLS is row-level, so it cannot stop an employee from rewriting the check-in time, the GPS
-- point or the photo on their own row — which is exactly the data payroll trusts. This trigger
-- locks those columns for non-managers; completing the record (check-out, note, complaint) and
-- the manager verification stay allowed.
create or replace function public.attendance_guard_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_manager boolean;
begin
  -- No session (dashboard, service role) or somebody else's row handled by the policies above:
  -- nothing to guard here.
  if auth.uid() is null or auth.uid() <> old.employee_id then
    return new;
  end if;

  select upper(coalesce(u.role, '')) in ('OWNER', 'CHU')
    into caller_is_manager
  from public.users u
  where u.id = auth.uid();

  if coalesce(caller_is_manager, false) then
    return new;
  end if;

  -- `check_in_distance_m` is deliberately absent: `attendance_compute_distance` derives it from
  -- the coordinates below, so comparing it would flag a change the employee did not make.
  if new.employee_id <> old.employee_id
    or new.branch_id <> old.branch_id
    or new.work_date is distinct from old.work_date
    or new.shift_id is distinct from old.shift_id
    or new.check_in_at is distinct from old.check_in_at
    or new.check_in_latitude is distinct from old.check_in_latitude
    or new.check_in_longitude is distinct from old.check_in_longitude
    or new.check_in_photo_url is distinct from old.check_in_photo_url
  then
    raise exception
      'An employee may only complete their own attendance record (check-out, note, complaint).';
  end if;

  return new;
end;
$$;

drop trigger if exists attendance_guard_self_update on public.attendance;
create trigger attendance_guard_self_update
  before update on public.attendance
  for each row execute function public.attendance_guard_self_update();