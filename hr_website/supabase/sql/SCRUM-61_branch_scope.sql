-- SCRUM-61: phạm vi chi nhánh — trưởng chi nhánh chỉ quản lý chi nhánh của mình.
-- Run this script in Supabase Dashboard > SQL Editor, **after** `SCRUM-59_role_model.sql` and
-- `SCRUM-60_role_read_scope.sql`.
--
-- Why this exists: SCRUM-59 gave the organization a three-level role model, but a `MANAGER` still ran
-- the *whole* tenant: any manager could close another branch's day, schedule into it, verify its
-- attendance, edit its equipment and approve its requests. `branches.manager_id` already names the
-- chi nhánh trưởng of a branch, so this script makes that link decide what a manager may write:
--
--   OWNER   — every branch of the organization (unchanged).
--   MANAGER — only the branch(es) where `branches.manager_id = auth.uid()`; anything else answers
--             `403` from the app and, more importantly, matches no policy here.
--   EMPLOYEE— unchanged: their own rows (`attendance_insert_own`, `attendance_update_own`,
--             `requests_insert_own`, `attendance_guard_self_update`).
--
-- Scope of the change — **write policies only**, plus the branch DELETE policy this ticket adds:
--   * `branches`           update (owner or its own head) and delete (owner only; did not exist before)
--   * `daily_revenue`      insert / update
--   * `shift_assignments`  insert / update / delete
--   * `attendance`         the manager UPDATE (`attendance_update_managers`)
--   * `facilities`         insert / update / delete
--   * `requests`           the manager UPDATE (`requests_update_managers`)
--
-- Reads are deliberately **not** narrowed: SCRUM-60 gave a manager the whole organization's lists, and
-- `/attendance`, `/employee-status`, `/requests`, `/schedules` and `/facilities` use them as read
-- filters. Narrowing those would hide the very data a filter exists to browse, so the *screens* gray
-- out the branches a manager may not act on — a UI consequence of this script, not a second rule.
--
-- Every policy below keeps all clauses of the one it replaces (`organization_id = …`, `created_by` /
-- `closed_by` / `employee_id = auth.uid()`, `status = 'PENDING'`, both the `using` and the `with check`
-- half) and only replaces the role test:
--
--   public.is_organization_manager()   →   (public.is_organization_owner() or public.heads_branch(…))
--
-- One policy therefore ends up *narrower* than the one it replaces, never wider. Applying this script
-- without the app build that ships with it is safe: the only visible difference is that a manager who
-- heads no branch can no longer write.

-- ── Preconditions ────────────────────────────────────────────────────────────────────────
-- Failing loudly beats half-applying: the helper below reads `branches`, and the write policies touch
-- every operational table.
do $$
begin
  if to_regclass('public.branches') is null
    or to_regclass('public.daily_revenue') is null
    or to_regclass('public.shift_assignments') is null
    or to_regclass('public.attendance') is null
    or to_regclass('public.facilities') is null
    or to_regclass('public.requests') is null then
    raise exception 'SCRUM-61: run SCRUM-21, SCRUM-30, SCRUM-39, SCRUM-45, SCRUM-47 and SCRUM-53 first — a table this script guards is missing.';
  end if;

  if not exists (select 1 from pg_proc where proname = 'is_organization_owner') then
    raise exception 'SCRUM-61: run SCRUM-59_role_model.sql first — public.is_organization_owner() is missing.';
  end if;
end $$;

-- ── 1. `heads_branch()` — the single place that knows who a chi nhánh trưởng is ───────────
-- `security definer` for the same reason `is_organization_manager()` is (SCRUM-54): this function
-- reads `public.branches`, the `branches` UPDATE policy calls it, and as an invoker function the
-- policy would re-enter itself on the inner read ("stack depth limit exceeded"). It answers about the
-- caller only (`b.manager_id = auth.uid()`), so a definer context leaks nothing.
--
-- The role test is part of the definition on purpose: `OWNER` and `MANAGER` run a branch, so an
-- `EMPLOYEE` named in `manager_id` — a legacy row, or a handwritten `update` — still has no scope.
-- The app refuses to assign one in the first place (`BranchManagerRoleError`), and the branch picker
-- does not offer them.
create or replace function public.heads_branch(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_organization_manager()
    and exists (
      select 1
      from public.branches b
      where b.id = p_branch_id
        and b.manager_id = auth.uid()
        and b.organization_id = public.current_organization_id()
    )
$$;

comment on function public.heads_branch(uuid) is
  'SCRUM-61: true when the caller is a manager (OWNER/MANAGER) who heads that branch (branches.manager_id = auth.uid()). Replaces is_organization_manager() in the operational write policies, so a manager only writes their own branch.';

grant execute on function public.heads_branch(uuid) to authenticated;

-- ── 2. Branches ──────────────────────────────────────────────────────────────────────────
-- UPDATE: the owner, or the head of that very branch (SCRUM-59 had made this owner-only).
drop policy if exists "Owners can update branches" on public.branches;
drop policy if exists "Branch heads can update their branch" on public.branches;
create policy "Branch heads can update their branch"
  on public.branches
  for update
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (
      public.is_organization_owner()
      or public.heads_branch(id)
    )
  )
  with check (organization_id = public.current_organization_id());

-- DELETE: new policy, owner only. Without a DELETE policy nobody can delete a branch at all (RLS
-- denies what no policy allows), which is why `DELETE /api/branches/{id}` found no row before.
drop policy if exists "Owners can delete branches" on public.branches;
create policy "Owners can delete branches"
  on public.branches
  for delete
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  );

-- A head may edit their branch (name, address, geofence, radius) but must not hand it on: moving
-- `manager_id` is how a manager would grant themselves a second branch, so that stays an owner
-- action. `with check` cannot compare against the old row, hence a trigger.
create or replace function public.branches_guard_manager_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.manager_id is distinct from old.manager_id
    and not coalesce(public.is_organization_owner(), false)
  then
    raise exception 'Only the organization owner may change who heads a branch (SCRUM-61).';
  end if;

  -- The `with check` above already refuses this; restated so the rule survives a future relaxation
  -- and so the failure names the real problem instead of "new row violates row-level security".
  if new.organization_id is distinct from old.organization_id then
    raise exception 'A branch cannot move to another organization (SCRUM-61).';
  end if;

  return new;
end;
$$;

drop trigger if exists branches_guard_manager_change on public.branches;
create trigger branches_guard_manager_change
  before update on public.branches
  for each row execute function public.branches_guard_manager_change();

-- Deleting a branch cascades (`attendance`, `shift_assignments` and `facilities` are `on delete
-- cascade`, and `daily_revenue.branch_id` has no foreign key at all, so its rows would be orphaned).
-- A branch that still holds operational history therefore cannot be deleted; the counts are named so
-- the operator knows what to move or remove first. The app checks the same counts (409) and repeats
-- this sentence; this trigger is the backstop for a direct PostgREST call.
-- `security definer` is required: as the caller, RLS could hide rows and the trigger would pass while
-- the cascade still deleted them.
create or replace function public.branches_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attendance integer;
  v_assignments integer;
  v_facilities integer;
  v_revenue integer;
begin
  select count(*) into v_attendance from public.attendance where branch_id = old.id;
  select count(*) into v_assignments from public.shift_assignments where branch_id = old.id;
  select count(*) into v_facilities from public.facilities where branch_id = old.id;
  select count(*) into v_revenue from public.daily_revenue where branch_id = old.id;

  if (v_attendance + v_assignments + v_facilities + v_revenue) > 0 then
    raise exception
      'This branch still has data (attendance: %, shifts: %, facilities: %, revenue: %). Move or remove it first.',
      v_attendance, v_assignments, v_facilities, v_revenue;
  end if;

  return old;
end;
$$;

drop trigger if exists branches_guard_delete on public.branches;
create trigger branches_guard_delete
  before delete on public.branches
  for each row execute function public.branches_guard_delete();

-- ── 3. Daily revenue (SCRUM-39/40, narrowed by SCRUM-60) ─────────────────────────────────
drop policy if exists "Authenticated users can create their own revenue declaration" on public.daily_revenue;
create policy "Branch heads can declare revenue"
  on public.daily_revenue
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and organization_id = public.current_organization_id()
    and (
      public.is_organization_owner()
      or public.heads_branch(branch_id)
    )
  );

drop policy if exists "Authenticated users can close daily revenue" on public.daily_revenue;
create policy "Branch heads can close revenue"
  on public.daily_revenue
  for update
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (
      public.is_organization_owner()
      or public.heads_branch(branch_id)
    )
  )
  with check (
    closed_by = auth.uid()
    and organization_id = public.current_organization_id()
    and (
      public.is_organization_owner()
      or public.heads_branch(branch_id)
    )
  );

-- ── 4. Shift assignments (SCRUM-30, tenant-scoped by SCRUM-53) ───────────────────────────
-- `branch_id` is `not null` here (SCRUM-30), so `heads_branch(branch_id)` always has a branch to
-- test. Moving an assignment *into* another branch is refused by the `with check` half, which is why
-- both halves carry the same condition.
drop policy if exists shift_assignments_insert_managers on public.shift_assignments;
create policy shift_assignments_insert_managers
  on public.shift_assignments
  for insert
  to authenticated
  with check (
    organization_id = public.current_organization_id()
    and (
      public.is_organization_owner()
      or public.heads_branch(branch_id)
    )
  );

drop policy if exists shift_assignments_update_managers on public.shift_assignments;
create policy shift_assignments_update_managers
  on public.shift_assignments
  for update
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (
      public.is_organization_owner()
      or public.heads_branch(branch_id)
    )
  )
  with check (
    organization_id = public.current_organization_id()
    and (
      public.is_organization_owner()
      or public.heads_branch(branch_id)
    )
  );

drop policy if exists shift_assignments_delete_managers on public.shift_assignments;
create policy shift_assignments_delete_managers
  on public.shift_assignments
  for delete
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (
      public.is_organization_owner()
      or public.heads_branch(branch_id)
    )
  );

-- ── 5. Attendance: the manager half only ─────────────────────────────────────────────────
-- `attendance_insert_own`, `attendance_update_own` (the employee completing their own record) and the
-- `attendance_guard_self_update` trigger (SCRUM-21/59) are untouched: the mobile check-in must keep
-- working exactly as it does today.
drop policy if exists attendance_update_managers on public.attendance;
create policy attendance_update_managers
  on public.attendance
  for update
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (
      public.is_organization_owner()
      or public.heads_branch(branch_id)
    )
  )
  with check (
    organization_id = public.current_organization_id()
    and (
      public.is_organization_owner()
      or public.heads_branch(branch_id)
    )
  );



-- ── 6. Facilities (SCRUM-45, tenant-scoped by SCRUM-53) ──────────────────────────────────
drop policy if exists facilities_insert_managers on public.facilities;
create policy facilities_insert_managers
  on public.facilities
  for insert
  to authenticated
  with check (
    organization_id = public.current_organization_id()
    and (
      public.is_organization_owner()
      or public.heads_branch(branch_id)
    )
  );

drop policy if exists facilities_update_managers on public.facilities;
create policy facilities_update_managers
  on public.facilities
  for update
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (
      public.is_organization_owner()
      or public.heads_branch(branch_id)
    )
  )
  with check (
    organization_id = public.current_organization_id()
    and (
      public.is_organization_owner()
      or public.heads_branch(branch_id)
    )
  );

drop policy if exists facilities_delete_managers on public.facilities;
create policy facilities_delete_managers
  on public.facilities
  for delete
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (
      public.is_organization_owner()
      or public.heads_branch(branch_id)
    )
  );

-- ── 7. Requests: the review half only (SCRUM-41) ─────────────────────────────────────────
-- `requests_insert_own` is untouched — raising one's own request is the employee flow. `branch_id`
-- is nullable here (`on delete set null`), and a request that already lost its branch has nobody left
-- to head it, so only the owner may review it.
drop policy if exists requests_update_managers on public.requests;
create policy requests_update_managers
  on public.requests
  for update
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (
      public.is_organization_owner()
      or (branch_id is not null and public.heads_branch(branch_id))
    )
  )
  with check (
    organization_id = public.current_organization_id()
    and (
      public.is_organization_owner()
      or (branch_id is not null and public.heads_branch(branch_id))
    )
  );

-- ── Verify ───────────────────────────────────────────────────────────────────────────────
-- 1. The helper exists and is `security definer` (`prosecdef` must be true — a false value brings back
--    "stack depth limit exceeded" on every branch write).
select proname, prosecdef, pg_get_functiondef(oid) as definition
from pg_proc
where proname = 'heads_branch';

-- 2. Read the policies: every one that used to test only the manager role now also asks who heads the
--    branch, and no policy lost a clause (compare `organization_id`, `created_by`/`closed_by`,
--    `employee_id`, `status = 'PENDING'`).
select tablename, policyname, cmd, qual, with_check
from pg_policies
where tablename in ('branches', 'daily_revenue', 'shift_assignments', 'attendance', 'facilities', 'requests')
order by tablename, policyname;

-- 3. The branch DELETE policy exists and is owner-only.
select policyname, cmd, qual
from pg_policies
where tablename = 'branches' and cmd = 'DELETE';

-- 4. Both guards are installed.
select tgname, tgrelid::regclass as table_name
from pg_trigger
where not tgisinternal
  and tgname in ('branches_guard_manager_change', 'branches_guard_delete');

-- 5. Who heads what. A branch with `manager_id = null` can only be written by the owner, so assign a
--    chi nhánh trưởng on `/branches` (or with an `update`) before expecting a manager to work there.
select b.name, b.manager_id, u.full_name as head_of_branch, b.organization_id
from public.branches b
left join public.users u on u.id = b.manager_id
order by b.name;

