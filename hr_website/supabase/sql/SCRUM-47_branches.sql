-- SCRUM-47: Quản lý chi nhánh (branch registry + GPS geofence dùng cho chấm công).
-- Run this script in Supabase Dashboard > SQL Editor.

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Added one by one so the script stays idempotent when `branches` already exists with
-- only the base columns (the table was created by hand in the dashboard before this ticket).
alter table public.branches add column if not exists address text;
alter table public.branches add column if not exists manager_id uuid references public.users (id);
alter table public.branches add column if not exists latitude double precision;
alter table public.branches add column if not exists longitude double precision;
alter table public.branches add column if not exists attendance_radius integer not null default 50;

-- Radius is the allowed check-in distance in metres; the mobile app rejects a GPS point
-- further away than this from (latitude, longitude). Keep the bounds in sync with the
-- API validation in app/api/branches/route.ts.
alter table public.branches drop constraint if exists branches_attendance_radius_check;
alter table public.branches add constraint branches_attendance_radius_check
  check (attendance_radius between 10 and 2000);

-- A geofence is only usable when both coordinates are present.
alter table public.branches drop constraint if exists branches_geofence_coordinates_check;
alter table public.branches add constraint branches_geofence_coordinates_check
  check ((latitude is null) = (longitude is null));

create index if not exists branches_manager_id_idx
  on public.branches (manager_id);

alter table public.branches enable row level security;

-- Every signed-in staff member needs the branch list (shift pickers, attendance context),
-- so reads stay open to `authenticated` while writes are limited to owners.
drop policy if exists "Authenticated users can read branches" on public.branches;
create policy "Authenticated users can read branches"
  on public.branches
  for select
  to authenticated
  using (true);

drop policy if exists "Owners can create branches" on public.branches;
create policy "Owners can create branches"
  on public.branches
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and upper(u.role) in ('OWNER', 'CHU')
    )
  );

drop policy if exists "Owners can update branches" on public.branches;
create policy "Owners can update branches"
  on public.branches
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
