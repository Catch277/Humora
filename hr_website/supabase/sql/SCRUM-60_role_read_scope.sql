-- SCRUM-60: phạm vi đọc theo vai trò (read scope per role).
-- Run this script in Supabase Dashboard > SQL Editor, **after** `SCRUM-59_role_model.sql`.
--
-- SCRUM-53 made every operational table belong to an organization, so no account could read another
-- tenant's rows. Inside one organization, however, every member still read everything: a barista
-- could list the whole timesheet, every colleague's requests, the revenue of the month and the
-- equipment inventory. SCRUM-59 gave the app three levels; this script brings the *reads* in line:
--
--   EMPLOYEE — their own attendance, their own requests, their own shift assignments.
--   MANAGER  — everything above, plus every row of the organization (they review, approve and report).
--   OWNER    — same reads as a manager (staff administration is a *write* boundary, SCRUM-59).
--
-- Why the narrowing is safe: every screen that shows an organization-wide list is manager-only in
-- `lib/accessPolicy.ts` (`/revenue`, `/reports`, `/employee-status`, `/facilities`), and
-- `proxy.ts` send an employee who deep-links into one of them back to the dashboard. `get_revenue_report()`
-- and `get_employee_status()` are `security invoker`, so they follow these policies automatically
-- and needed no change of their own.

-- ── 1. The timesheet: own rows, or a manager ─────────────────────────────────────────────
-- The employee half is `employee_id = auth.uid()`; the `organization_id` predicate from SCRUM-53 is
-- kept verbatim, so this policy is narrower than the one it replaces, never wider.
drop policy if exists attendance_select_authenticated on public.attendance;
create policy attendance_select_authenticated
  on public.attendance
  for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (
      employee_id = auth.uid()
      or public.is_organization_manager()
    )
  );

-- ── 2. Requests: own rows, or a manager ──────────────────────────────────────────────────
-- The insert policy (`requests_insert_own`) is untouched: raising one's own request is exactly the
-- employee flow. Only the list narrows, so `/requests` shows a manager the whole queue and an
-- employee their own submissions.
drop policy if exists requests_select_authenticated on public.requests;
create policy requests_select_authenticated
  on public.requests
  for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (
      user_id = auth.uid()
      or public.is_organization_manager()
    )
  );

-- ── 3. The schedule: own assignments, or a manager ───────────────────────────────────────
-- A manager keeps the whole calendar (`/schedules`); an employee sees their own shifts. The mobile
-- check-in never reads this table — `hr_mobile_app` talks to Supabase Auth only — so nothing outside
-- this app depends on the wider read.
drop policy if exists shift_assignments_select_authenticated on public.shift_assignments;
create policy shift_assignments_select_authenticated
  on public.shift_assignments
  for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (
      employee_id = auth.uid()
      or public.is_organization_manager()
    )
  );

-- ── 4. Facilities: managers only ─────────────────────────────────────────────────────────
-- The inventory of a branch is a management list (`/facilities`), and no employee screen reads it.
-- The write policies (`facilities_insert/update/delete_managers`) already asked for the manager role.
drop policy if exists facilities_select_authenticated on public.facilities;
create policy facilities_select_authenticated
  on public.facilities
  for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  );

-- ── 5. Revenue: managers only, reads and writes ──────────────────────────────────────────
-- Declaring the day's revenue (`POST /api/revenue/open`), closing it (`PUT /api/revenue/close`) and
-- reading the month (`GET /api/revenue/report`) are all manager actions; the two write policies had
-- only `created_by`/`closed_by = auth.uid()`, which let an employee declare a number payroll would
-- then trust.
drop policy if exists "Authenticated users can read daily revenue" on public.daily_revenue;
create policy "Authenticated users can read daily revenue"
  on public.daily_revenue
  for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  );

drop policy if exists "Authenticated users can create their own revenue declaration" on public.daily_revenue;
create policy "Authenticated users can create their own revenue declaration"
  on public.daily_revenue
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and organization_id = public.current_organization_id()
    and public.is_organization_manager()
  );

drop policy if exists "Authenticated users can close daily revenue" on public.daily_revenue;
create policy "Authenticated users can close daily revenue"
  on public.daily_revenue
  for update
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  )
  with check (
    closed_by = auth.uid()
    and organization_id = public.current_organization_id()
    and public.is_organization_manager()
  );

-- ── Deliberately NOT narrowed ────────────────────────────────────────────────────────────
-- 1. `users` stays "my own row, or anybody in my organization" (SCRUM-51). Narrowing names to the
--    owner/manager would blank the *approver* and *verifier* names on an employee's own request and
--    timesheet — the attribution they most need to see — and the table holds no sensitive column
--    (SCRUM-24: id, full_name, role, is_active, created_at). The screening of the directory is a
--    screen and API rule instead: `/staff` is owner-only (`staff:manage`) and `GET /api/users`
--    answers `403` below the manager role.
-- 2. `branches` and `shifts` stay readable by every member of the organization: `/attendance`,
--    `/requests` and `/schedules` need a branch filter and the shift catalogue for an employee too,
--    and the mobile check-in resolves the geofence from `branches`.
-- 3. `notifications` and `notification_settings` are already `user_id = auth.uid()` — narrower than
--    any role rule could be.

-- ── Verify ───────────────────────────────────────────────────────────────────────────────
-- 1. Every policy of the narrowed tables must now mention `auth.uid()` or `is_organization_manager()`
--    next to the organization predicate.
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('attendance', 'requests', 'shift_assignments', 'facilities', 'daily_revenue')
order by tablename, policyname;

-- 2. Signed in as an EMPLOYEE, these must return only their own rows (and zero revenue/facilities):
--      select count(*) from public.attendance;
--      select count(*) from public.requests;
--      select count(*) from public.shift_assignments;
--      select count(*) from public.daily_revenue;
--      select count(*) from public.facilities;
--    Signed in as a MANAGER or OWNER, each count is the organization's total.

-- ── After running this ───────────────────────────────────────────────────────────────────
-- 1. An employee who opens `/`, `/requests`, `/attendance` or `/schedules` sees their own data; the
--    screens that used to show organization-wide lists are unreachable for them (proxy + sidebar).
-- 2. A manager keeps every operational list. Nothing about the write rules changed here — those live
--    in SCRUM-59 (owner-only boundaries) and SCRUM-53 (`is_organization_manager()` for the rest).
-- 3. If a manager's own row is missing from a list they expect, check `users.organization_id` for
--    that account before suspecting the policy: both helpers read it.
