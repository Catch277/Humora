-- SCRUM-53: đưa dữ liệu vận hành vào tổ chức (tenant scoping).
-- Run this script in Supabase Dashboard > SQL Editor — **after** you have created your organization
-- on /onboarding, otherwise the backfill at the end cannot decide where the existing rows belong.
--
-- Why this exists: SCRUM-51 introduced organizations but left the operational tables shared — every
-- signed-in account could still read every branch, timesheet and revenue row, so an organization was
-- a join gate rather than isolation. This script adds `organization_id` to those tables and repeats
-- the organization predicate in every policy.
--
-- Why the RPCs are NOT touched: `get_employee_status` and `get_revenue_report` are `security
-- invoker`, so they read those tables under the caller's own RLS. Tightening the policies below
-- scopes them automatically — rewriting the function bodies would only add a second place to get
-- this wrong.
--
-- Order matters: add the column *without* a default, then set the default. Adding it with a
-- `stable` function as the default in one step makes PostgreSQL apply that default to the existing
-- rows too, which would silently put every legacy row in whatever organization reads it first.

-- ── Columns ──────────────────────────────────────────────────────────────────────────────
alter table public.branches add column if not exists organization_id uuid references public.organizations (id);
alter table public.branches alter column organization_id set default public.current_organization_id();

alter table public.shifts add column if not exists organization_id uuid references public.organizations (id);
alter table public.shifts alter column organization_id set default public.current_organization_id();

alter table public.shift_assignments add column if not exists organization_id uuid references public.organizations (id);
alter table public.shift_assignments alter column organization_id set default public.current_organization_id();

alter table public.attendance add column if not exists organization_id uuid references public.organizations (id);
alter table public.attendance alter column organization_id set default public.current_organization_id();

alter table public.requests add column if not exists organization_id uuid references public.organizations (id);
alter table public.requests alter column organization_id set default public.current_organization_id();

alter table public.facilities add column if not exists organization_id uuid references public.organizations (id);
alter table public.facilities alter column organization_id set default public.current_organization_id();

alter table public.daily_revenue add column if not exists organization_id uuid references public.organizations (id);
alter table public.daily_revenue alter column organization_id set default public.current_organization_id();

-- ── Indexes ──────────────────────────────────────────────────────────────────────────────
-- Every policy below filters on this column, so each table gets the index for it.
create index if not exists branches_organization_idx on public.branches (organization_id);
create index if not exists shifts_organization_idx on public.shifts (organization_id);
create index if not exists shift_assignments_organization_idx on public.shift_assignments (organization_id);
create index if not exists attendance_organization_idx on public.attendance (organization_id);
create index if not exists requests_organization_idx on public.requests (organization_id);
create index if not exists facilities_organization_idx on public.facilities (organization_id);
create index if not exists daily_revenue_organization_idx on public.daily_revenue (organization_id);

-- ── Notifications are deliberately left alone ────────────────────────────────────────────
-- `notifications` and `notification_settings` are already scoped to `user_id = auth.uid()`, which
-- is narrower than an organization, so there is nothing to isolate there.

-- ── Branches ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Authenticated users can read branches" on public.branches;
create policy "Authenticated users can read branches"
  on public.branches
  for select
  to authenticated
  using (organization_id = public.current_organization_id());

drop policy if exists "Owners can create branches" on public.branches;
create policy "Owners can create branches"
  on public.branches
  for insert
  to authenticated
  with check (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  );

drop policy if exists "Owners can update branches" on public.branches;
create policy "Owners can update branches"
  on public.branches
  for update
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  )
  with check (organization_id = public.current_organization_id());

-- ── Shifts (the template catalogue) ──────────────────────────────────────────────────────
drop policy if exists shifts_select_authenticated on public.shifts;
create policy shifts_select_authenticated
  on public.shifts
  for select
  to authenticated
  using (organization_id = public.current_organization_id());

-- ── Shift assignments (the schedule) ─────────────────────────────────────────────────────
drop policy if exists shift_assignments_select_authenticated on public.shift_assignments;
create policy shift_assignments_select_authenticated
  on public.shift_assignments
  for select
  to authenticated
  using (organization_id = public.current_organization_id());

drop policy if exists shift_assignments_insert_managers on public.shift_assignments;
create policy shift_assignments_insert_managers
  on public.shift_assignments
  for insert
  to authenticated
  with check (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  );

drop policy if exists shift_assignments_update_managers on public.shift_assignments;
create policy shift_assignments_update_managers
  on public.shift_assignments
  for update
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  )
  with check (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  );

drop policy if exists shift_assignments_delete_managers on public.shift_assignments;
create policy shift_assignments_delete_managers
  on public.shift_assignments
  for delete
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  );

-- ── Attendance (Bảng công) ───────────────────────────────────────────────────────────────
-- The original conditions are kept verbatim and the organization predicate is added: a policy
-- rewrite must never end up looser than the one it replaces.
drop policy if exists attendance_select_authenticated on public.attendance;
create policy attendance_select_authenticated
  on public.attendance
  for select
  to authenticated
  using (organization_id = public.current_organization_id());

drop policy if exists attendance_insert_own on public.attendance;
create policy attendance_insert_own
  on public.attendance
  for insert
  to authenticated
  with check (
    employee_id = auth.uid()
    and organization_id = public.current_organization_id()
  );

drop policy if exists attendance_update_own on public.attendance;
create policy attendance_update_own
  on public.attendance
  for update
  to authenticated
  using (
    employee_id = auth.uid()
    and organization_id = public.current_organization_id()
  )
  with check (
    employee_id = auth.uid()
    and organization_id = public.current_organization_id()
  );

drop policy if exists attendance_update_managers on public.attendance;
create policy attendance_update_managers
  on public.attendance
  for update
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  )
  with check (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  );

-- ── Requests (Đơn từ) ────────────────────────────────────────────────────────────────────
drop policy if exists requests_select_authenticated on public.requests;
create policy requests_select_authenticated
  on public.requests
  for select
  to authenticated
  using (organization_id = public.current_organization_id());

drop policy if exists requests_insert_own on public.requests;
create policy requests_insert_own
  on public.requests
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and status = 'PENDING'
    and organization_id = public.current_organization_id()
  );

drop policy if exists requests_update_managers on public.requests;
create policy requests_update_managers
  on public.requests
  for update
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  )
  with check (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  );

-- ── Facilities (Cơ sở vật chất) ──────────────────────────────────────────────────────────
drop policy if exists facilities_select_authenticated on public.facilities;
create policy facilities_select_authenticated
  on public.facilities
  for select
  to authenticated
  using (organization_id = public.current_organization_id());

drop policy if exists facilities_insert_managers on public.facilities;
create policy facilities_insert_managers
  on public.facilities
  for insert
  to authenticated
  with check (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  );

drop policy if exists facilities_update_managers on public.facilities;
create policy facilities_update_managers
  on public.facilities
  for update
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  )
  with check (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  );

drop policy if exists facilities_delete_managers on public.facilities;
create policy facilities_delete_managers
  on public.facilities
  for delete
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  );

-- ── Daily revenue (Doanh thu) ────────────────────────────────────────────────────────────
drop policy if exists "Authenticated users can read daily revenue" on public.daily_revenue;
create policy "Authenticated users can read daily revenue"
  on public.daily_revenue
  for select
  to authenticated
  using (organization_id = public.current_organization_id());

drop policy if exists "Authenticated users can create their own revenue declaration" on public.daily_revenue;
create policy "Authenticated users can create their own revenue declaration"
  on public.daily_revenue
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and organization_id = public.current_organization_id()
  );

drop policy if exists "Authenticated users can close daily revenue" on public.daily_revenue;
create policy "Authenticated users can close daily revenue"
  on public.daily_revenue
  for update
  to authenticated
  using (organization_id = public.current_organization_id())
  with check (
    closed_by = auth.uid()
    and organization_id = public.current_organization_id()
  );

-- ── Backfill ─────────────────────────────────────────────────────────────────────────────
-- The rows that existed before this script have no organization. With exactly one organization it
-- is unambiguous where they belong; with none (or several) the script says so instead of guessing.
do $$
declare
  v_organization_count integer;
  v_organization_id uuid;
begin
  select count(*) into v_organization_count from public.organizations;

  if v_organization_count <> 1 then
    raise notice 'SCRUM-53: % organization(s) exist, so existing rows keep organization_id = null and stay invisible. Create your organization on /onboarding first, then run the manual backfill at the end of this script.', v_organization_count;
    return;
  end if;

  select id into v_organization_id from public.organizations;

  update public.branches set organization_id = v_organization_id where organization_id is null;
  update public.shifts set organization_id = v_organization_id where organization_id is null;
  update public.shift_assignments set organization_id = v_organization_id where organization_id is null;
  update public.attendance set organization_id = v_organization_id where organization_id is null;
  update public.requests set organization_id = v_organization_id where organization_id is null;
  update public.facilities set organization_id = v_organization_id where organization_id is null;
  update public.daily_revenue set organization_id = v_organization_id where organization_id is null;

  raise notice 'SCRUM-53: existing rows were assigned to organization %.', v_organization_id;
end $$;

-- ── Verify ───────────────────────────────────────────────────────────────────────────────
-- 1. Every policy of the operational tables must mention `organization_id` or `auth.uid()`. A
--    policy that mentions neither means its `drop` did not match the stored name and that table is
--    still shared — fix the name instead of leaving it as is.
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in (
    'branches', 'shifts', 'shift_assignments', 'attendance', 'requests', 'facilities',
    'daily_revenue', 'users', 'organizations', 'organization_join_codes', 'organization_invites'
  )
order by tablename, policyname;

-- 2. Rows still outside any organization — every count must be zero when the backfill ran.
select 'branches' as table_name, count(*) as rows_without_organization from public.branches where organization_id is null
union all select 'shifts', count(*) from public.shifts where organization_id is null
union all select 'shift_assignments', count(*) from public.shift_assignments where organization_id is null
union all select 'attendance', count(*) from public.attendance where organization_id is null
union all select 'requests', count(*) from public.requests where organization_id is null
union all select 'facilities', count(*) from public.facilities where organization_id is null
union all select 'daily_revenue', count(*) from public.daily_revenue where organization_id is null;

-- If the organization already existed and the block above skipped the backfill, assign the old rows
-- by hand (replace the uuid with your organization's id), then run query 2 again:
--   update public.branches set organization_id = '<organization-uuid>' where organization_id is null;
--   -- and the same for shifts, shift_assignments, attendance, requests, facilities, daily_revenue.

-- ── After running this ───────────────────────────────────────────────────────────────────
-- 1. The mobile check-in keeps working: `attendance.organization_id` defaults to
--    `current_organization_id()`, so the app inserts a scoped row without changing any code.
-- 2. `get_employee_status` and `get_revenue_report` are `security invoker`, so they now return only
--    the caller's organization without touching their definitions.
-- 3. An account with no organization sees no operational data at all — the /onboarding gate in
--    `proxy.ts` is what keeps that from looking like a broken screen.
