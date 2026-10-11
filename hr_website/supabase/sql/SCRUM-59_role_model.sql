-- SCRUM-59: mô hình quyền ba cấp — OWNER / MANAGER / EMPLOYEE.
-- Run this script in Supabase Dashboard > SQL Editor, **before** you deploy the app build that
-- renamed `CHU` to `MANAGER`, and before running `SCRUM-60_role_read_scope.sql`.
--
-- Why this exists: the app shipped with two privileged values, `OWNER` and `CHU`, and `CHU` meant two
-- different things at once ("quản lý chi nhánh" and "second owner"): it could rename the
-- organization, rotate its join code, invite accounts and administer staff. SCRUM-59 splits that
-- into three levels:
--
--   OWNER    — owns the organization: its settings (name, join code), its register of accounts
--              (invites, provisioning), its staff (roles, `is_active`) and its branches.
--   MANAGER  — runs the day-to-day operation: schedules, timesheet review, requests, revenue and
--              facilities. (Exactly what `CHU` could do *inside* the operation.)
--   EMPLOYEE — only their own rows.
--
-- `CHU` is renamed to `MANAGER` in the data, so no row keeps the old spelling. The app tolerates the
-- old value for one deploy (`normalizeRole` in `lib/domain/roles.ts`), which is what lets this script
-- and the app build ship in either order without a window where a manager is locked out.
--
-- What is deliberately NOT in this script: `branches`, `shifts` and `shift_assignments` keep their
-- org-wide SELECT policy (the mobile check-in reads them for the geofence and the shared schedule),
-- and the operational *write* policies keep using `is_organization_manager()`. Narrowing reads is
-- SCRUM-60.
--
-- After this script: run `SCRUM-60_role_read_scope.sql`, and redeploy the `staff-account` Edge
-- Function — its `INVITE_ROLES` and role check still spell the old value and would reject every
-- `MANAGER` account.

-- ── Preconditions ────────────────────────────────────────────────────────────────────────
-- Failing loudly beats half-applying: without these two tables the rename below cannot run, and a
-- silent skip would leave one table on `CHU` and one on `MANAGER`.
do $$
begin
  if to_regclass('public.users') is null
    or to_regclass('public.organization_invites') is null then
    raise exception 'SCRUM-59: run SCRUM-51_organizations.sql first — public.users and/or public.organization_invites is missing.';
  end if;
end $$;

-- ── 1. `CHU` → `MANAGER` in the data ─────────────────────────────────────────────────────
update public.users set role = 'MANAGER' where upper(coalesce(role, '')) = 'CHU';
update public.organization_invites set role = 'MANAGER' where upper(coalesce(role, '')) = 'CHU';

-- The invite constraint spelled the old list, so it would reject every new manager invite: the app
-- would answer `400` ("role must be one of EMPLOYEE, MANAGER") and a hand-written insert a `23514`.
alter table public.organization_invites drop constraint if exists organization_invites_role_check;
alter table public.organization_invites
  add constraint organization_invites_role_check check (role in ('EMPLOYEE', 'MANAGER'));

-- ── 2. The two policy helpers ────────────────────────────────────────────────────────────
-- Both MUST stay `security definer` with `set search_path = public` (SCRUM-54): they read
-- `public.users`, and the `users` policies call them, so as invoker functions the inner read
-- re-enters the policy and every profile read dies with "stack depth limit exceeded" — which also
-- silently kills the `/onboarding` redirect and makes the whole feature look missing.
create or replace function public.is_organization_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and upper(coalesce(u.role, '')) in ('OWNER', 'MANAGER')
  )
$$;

-- SCRUM-59: the narrow half of `is_organization_manager()`. Everything that changes the organization
-- *itself* — its name, its join code, its register of accounts, its staff and its branches — asks
-- this one instead, so a manager can never rename the tenant or mint an account. Kept as a
-- `security definer` helper for the same reason as its sibling above, and for the same reason it must
-- never be inlined into a policy on `users`.
create or replace function public.is_organization_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and upper(coalesce(u.role, '')) = 'OWNER'
  )
$$;

-- `create or replace` keeps existing grants; restated so a half-applied database cannot leave the
-- helpers unreachable.
grant execute on function public.current_organization_id() to authenticated;
grant execute on function public.is_organization_manager() to authenticated;
grant execute on function public.is_organization_owner() to authenticated;

-- ── 3. Owner-only policies ───────────────────────────────────────────────────────────────
-- Every policy below is the previous one with `is_organization_manager()` narrowed to
-- `is_organization_owner()`. Rewriting a policy may only ever *add* to the original condition, so the
-- `organization_id` predicates, the `id = auth.uid()` clauses and the `with check` halves are copied
-- verbatim from SCRUM-51/53 and only the role test changed — dropping a clause here is a silent
-- security regression no typecheck or lint would catch.
--
-- The names change from `..._managers` to `..._owners` at the same time, so a policy name keeps
-- telling the truth about who may use it; both names are dropped first so re-running is safe.

-- Staff administration (/staff): roles and `is_active` (SCRUM-24, rewritten by SCRUM-51).
drop policy if exists users_update_managers on public.users;
drop policy if exists users_update_owners on public.users;
create policy users_update_owners on public.users
  for update
  to authenticated
  using (
    organization_id is not null
    and organization_id = public.current_organization_id()
    and public.is_organization_owner()
  )
  with check (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  );

-- Renaming the organization (`PUT /api/organizations/current`).
drop policy if exists organizations_update_owners on public.organizations;
create policy organizations_update_owners on public.organizations
  for update
  to authenticated
  using (id = public.current_organization_id() and public.is_organization_owner())
  with check (id = public.current_organization_id() and public.is_organization_owner());

-- The join code (`GET /api/organizations/current`, `POST /api/organizations/current/code`): reading
-- it is already the "am I the owner?" test the `/organization` screen uses, so it moves to the owner
-- with the rest of the organization's settings.
drop policy if exists organization_join_codes_select_managers on public.organization_join_codes;
drop policy if exists organization_join_codes_select_owners on public.organization_join_codes;
create policy organization_join_codes_select_owners on public.organization_join_codes
  for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  );

-- The register of accounts (invites + provisioning, SCRUM-51/52).
drop policy if exists organization_invites_select_managers on public.organization_invites;
drop policy if exists organization_invites_select_owners on public.organization_invites;
create policy organization_invites_select_owners on public.organization_invites
  for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  );

drop policy if exists organization_invites_insert_managers on public.organization_invites;
drop policy if exists organization_invites_insert_owners on public.organization_invites;
create policy organization_invites_insert_owners on public.organization_invites
  for insert
  to authenticated
  with check (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
    and (invited_by is null or invited_by = auth.uid())
  );

drop policy if exists organization_invites_delete_managers on public.organization_invites;
drop policy if exists organization_invites_delete_owners on public.organization_invites;
create policy organization_invites_delete_owners on public.organization_invites
  for delete
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  );

-- The join audit trail: organization administration, so the owner reads it and the RPC writes it.
drop policy if exists organization_join_attempts_select_managers on public.organization_join_attempts;
drop policy if exists organization_join_attempts_select_owners on public.organization_join_attempts;
create policy organization_join_attempts_select_owners on public.organization_join_attempts
  for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  );

-- Branches (SCRUM-47, rewritten by SCRUM-53). Creating or editing a branch is what moves the geofence
-- every employee checks in against, so it belongs to the owner; a manager still *reads* every branch
-- of the organization, which is what the schedule and the employee-status filter need.
drop policy if exists "Owners can create branches" on public.branches;
create policy "Owners can create branches"
  on public.branches
  for insert
  to authenticated
  with check (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  );

drop policy if exists "Owners can update branches" on public.branches;
create policy "Owners can update branches"
  on public.branches
  for update
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  )
  with check (organization_id = public.current_organization_id());

-- ── 4. The check-in guard stops spelling the role list ───────────────────────────────────
-- SCRUM-21 wrote `upper(u.role) in ('OWNER', 'CHU')` inline. After the rename above that literal
-- would refuse *every* manager, which would silently let employees rewrite the GPS point, the photo
-- and the check-in time on their own record — the columns payroll trusts. It now asks the helper,
-- which is the single place that knows who counts as a manager.
create or replace function public.attendance_guard_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_manager boolean;
begin
  -- No session (dashboard, service role) or somebody else's row handled by the policies: nothing to
  -- guard here.
  if auth.uid() is null or auth.uid() <> old.employee_id then
    return new;
  end if;

  caller_is_manager := public.is_organization_manager();

  if coalesce(caller_is_manager, false) then
    return new;
  end if;

  -- `check_in_distance_m` is deliberately absent: `attendance_compute_distance` derives it from the
  -- coordinates below, so comparing it would flag a change the employee did not make.
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

-- ── Verify ───────────────────────────────────────────────────────────────────────────────
-- 1. Nothing still carries the old value (both counts must be zero).
select 'users' as table_name, count(*) as rows_on_chu
from public.users where upper(coalesce(role, '')) = 'CHU'
union all
select 'organization_invites', count(*)
from public.organization_invites where upper(coalesce(role, '')) = 'CHU';

-- 2. The vocabulary in the data now reads OWNER / MANAGER / EMPLOYEE.
select role, count(*) as accounts from public.users group by role order by role;

-- 3. Both helpers exist and are `security definer` (`prosecdef` must be true — a false value brings
--    back "stack depth limit exceeded" on every profile read, /onboarding included).
select proname, prosecdef, pg_get_functiondef(oid) as definition
from pg_proc
where proname in ('is_organization_manager', 'is_organization_owner');

-- 4. Who may use which policy. The owner-only policies of this script must mention
--    `is_organization_owner`; if one still mentions `is_organization_manager`, its `drop` above did
--    not match the stored name and that table is still open to a manager.
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'users', 'organizations', 'organization_join_codes', 'organization_invites',
    'organization_join_attempts', 'branches'
  )
order by tablename, policyname;

-- 5. The invite constraint now accepts a manager.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.organization_invites'::regclass
  and conname = 'organization_invites_role_check';

-- ── After running this ───────────────────────────────────────────────────────────────────
-- 1. Run `SCRUM-60_role_read_scope.sql` (who may *read* what).
-- 2. Redeploy the `staff-account` Edge Function: it validates `role must be EMPLOYEE or MANAGER` and
--    requires the caller to be the organization's OWNER.
-- 3. What changed for a `MANAGER` (the old `CHU`): they keep every operation — schedules, timesheet
--    verification and correction, request approval, revenue, facilities — and lose the organization's
--    own settings: renaming it, reading/rotating the join code, inviting or provisioning accounts,
--    and staff roles/`is_active`. They also lose branch edits (the geofence), and they keep reading
--    branches. Each of those losses answers `403` from the app and returns no row from the database;
--    the `/organization` and `/staff` screens are owner-only in `proxy.ts` and hidden from the
--    sidebar, so the loss is visible rather than mysterious.
-- 4. An `EMPLOYEE` may still read the shared schedule and every branch (the mobile check-in needs
--    them); SCRUM-60 narrows their own timesheet and requests to their own rows.
