-- SCRUM-30: Lịch làm việc (shift scheduling: the `shifts` catalogue + per-employee assignments).
-- Run this script in Supabase Dashboard > SQL Editor.
--
-- Two tables, two very different things:
--   * public.shifts            — the shift TEMPLATE ("Ca sáng", 08:00–17:00). It already
--                                existed (quick search reads `shifts.name`); this script only
--                                fills the gaps and seeds the standard shifts.
--   * public.shift_assignments — one row per person, per day, per template. This is what the
--                                /schedules screen and GET /api/schedules work with, and it
--                                replaces the in-memory mock shift list.
-- All statements are idempotent and none of them delete data.

-- ── 1. Shift catalogue ────────────────────────────────────────────────────────────────────
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  branch_id uuid references public.branches (id) on delete cascade,
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shifts add column if not exists name text;
alter table public.shifts add column if not exists branch_id uuid;
alter table public.shifts add column if not exists start_time time;
alter table public.shifts add column if not exists end_time time;
alter table public.shifts add column if not exists created_at timestamptz not null default now();
alter table public.shifts add column if not exists updated_at timestamptz not null default now();

-- `branch_id is null` means the template applies to every branch, so each seed is guarded by an
-- existence check on (name, branch_id) instead of a unique index the old table may lack.
insert into public.shifts (name, branch_id, start_time, end_time)
select 'Ca sáng', null, '08:00', '17:00'
where not exists (select 1 from public.shifts where name = 'Ca sáng' and branch_id is null);

insert into public.shifts (name, branch_id, start_time, end_time)
select 'Ca chiều', null, '13:00', '22:00'
where not exists (select 1 from public.shifts where name = 'Ca chiều' and branch_id is null);

insert into public.shifts (name, branch_id, start_time, end_time)
select 'Ca tối', null, '14:00', '23:00'
where not exists (select 1 from public.shifts where name = 'Ca tối' and branch_id is null);

-- Zero-length window: a "Nghỉ" assignment is a day off (status LEAVE), not working hours, and
-- the overlap rule in lib/usecases/shiftAssignmentInput.ts ignores it.
insert into public.shifts (name, branch_id, start_time, end_time)
select 'Nghỉ', null, '00:00', '00:00'
where not exists (select 1 from public.shifts where name = 'Nghỉ' and branch_id is null);

alter table public.shifts enable row level security;

drop policy if exists shifts_select_authenticated on public.shifts;
create policy shifts_select_authenticated on public.shifts
  for select
  to authenticated
  using (true);

-- ── 2. Shift assignments (the schedule) ──────────────────────────────────────────────────
create table if not exists public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.users (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  shift_id uuid not null references public.shifts (id),
  work_date date not null,
  status text not null default 'SCHEDULED',
  note text,
  -- Defaulted from the session so the row records who scheduled it without the API ever
  -- sending an ownership field (see AGENTS.md: ownership always comes from auth.uid()).
  created_by uuid references public.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shift_assignments add column if not exists employee_id uuid;
alter table public.shift_assignments add column if not exists branch_id uuid;
alter table public.shift_assignments add column if not exists shift_id uuid;
alter table public.shift_assignments add column if not exists work_date date;
alter table public.shift_assignments add column if not exists status text not null default 'SCHEDULED';
alter table public.shift_assignments add column if not exists note text;
alter table public.shift_assignments add column if not exists created_at timestamptz not null default now();
alter table public.shift_assignments add column if not exists updated_at timestamptz not null default now();

-- Values mirror SHIFT_ASSIGNMENT_STATUSES in lib/domain/entities/Shift.ts.
alter table public.shift_assignments drop constraint if exists shift_assignments_status_check;
alter table public.shift_assignments add constraint shift_assignments_status_check
  check (status in ('SCHEDULED', 'LEAVE', 'CANCELLED'));

-- One person cannot hold the same template twice on the same day. Overlapping *different*
-- templates are rejected by the use case (and answer 409), because only the application knows
-- the hours of the referenced shifts.
create unique index if not exists shift_assignments_employee_shift_day_idx
  on public.shift_assignments (employee_id, work_date, shift_id);

-- The schedule screen always asks for one week (and usually one branch) at a time.
create index if not exists shift_assignments_work_date_idx
  on public.shift_assignments (work_date);
create index if not exists shift_assignments_branch_work_date_idx
  on public.shift_assignments (branch_id, work_date);
create index if not exists shift_assignments_employee_work_date_idx
  on public.shift_assignments (employee_id, work_date);

alter table public.shift_assignments enable row level security;

-- Same model as SCRUM-47 (branches) and SCRUM-45 (facilities): every signed-in account may read
-- the shared schedule, while creating, moving or deleting a shift needs the OWNER / CHU role.
drop policy if exists shift_assignments_select_authenticated on public.shift_assignments;
create policy shift_assignments_select_authenticated on public.shift_assignments
  for select
  to authenticated
  using (true);

drop policy if exists shift_assignments_insert_managers on public.shift_assignments;
create policy shift_assignments_insert_managers on public.shift_assignments
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

drop policy if exists shift_assignments_update_managers on public.shift_assignments;
create policy shift_assignments_update_managers on public.shift_assignments
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

drop policy if exists shift_assignments_delete_managers on public.shift_assignments;
create policy shift_assignments_delete_managers on public.shift_assignments
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and upper(u.role) in ('OWNER', 'CHU')
    )
  );
