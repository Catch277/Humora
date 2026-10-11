-- SCRUM-63: mỗi nhân viên thuộc một chi nhánh — quyền truy cập nằm trong chi nhánh đó.
-- Run this script in Supabase Dashboard > SQL Editor, **after** `SCRUM-59`, `SCRUM-60` and `SCRUM-61`.
--
-- Why this exists: SCRUM-60 narrowed *reads* by role and SCRUM-61 narrowed *writes* by
-- `branches.manager_id`, but an EMPLOYEE still read the whole organization — the branch list, and any
-- row of their own filed at another branch, stayed visible. There was also no column saying *where*
-- an employee belongs, so a check-in or a đơn could name any branch of the tenant.
--
-- This script adds that column and makes it decide what an employee may see and file:
--
--   OWNER   — the whole organization (unchanged; `is_organization_manager()` is true for them).
--   MANAGER — the whole organization for reads (SCRUM-60) and the branch they head for writes
--             (SCRUM-61). Unchanged.
--   EMPLOYEE— only their own rows, and only inside `users.branch_id`. `branch_id is null` means
--             "belongs to no branch": they read no branch, no schedule and no attendance, and they
--             cannot file a request, until the owner assigns them one on `/staff`.
--
-- Reads are *added to*, never replaced: every policy below keeps the clauses of SCRUM-53/60 verbatim
-- (`organization_id = current_organization_id()`, `employee_id`/`user_id = auth.uid()`,
-- `status = 'PENDING'`, the manager half) and adds the branch test to the employee half only, so each
-- policy ends up narrower than the one it replaces. Dropping a clause here would be a silent security
-- regression that no typecheck or lint would catch.

-- ── Preconditions ────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.users') is null or to_regclass('public.branches') is null then
    raise exception 'SCRUM-63: run SCRUM-51_organizations.sql (users, branches) first.';
  end if;

  if not exists (select 1 from pg_proc where proname = 'is_organization_manager') then
    raise exception 'SCRUM-63: run SCRUM-59_role_model.sql first — public.is_organization_manager() is missing.';
  end if;
end $$;

-- ── 1. `users.branch_id` — the branch an account belongs to ───────────────────────────────
-- Same shape as `branches.manager_id`: a nullable uuid pointing at a branch. `on delete set null`
-- deliberately leaves the account in place when a branch is removed (the SCRUM-61 guard refuses to
-- delete a branch that still has data, so the cascade only happens for an empty one), and the person
-- simply becomes unassigned again.
alter table public.users add column if not exists branch_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_branch_id_fkey'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_branch_id_fkey
      foreign key (branch_id) references public.branches (id) on delete set null not valid;
  end if;
end $$;

create index if not exists users_branch_id_idx on public.users (branch_id);

-- ── 2. `current_branch_id()` — the single place the policies ask "where does the caller belong" ──
-- `security definer` with `set search_path = public`, for the same reason `is_organization_manager()`
-- is (SCRUM-54): it reads `public.users`, and the `users` policies call the sibling helpers, so as an
-- invoker function the inner read re-enters a policy on `users` and the caller's own profile read
-- dies with "stack depth limit exceeded". It answers about `auth.uid()` only, so a definer context
-- leaks nothing.
create or replace function public.current_branch_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.branch_id
  from public.users u
  where u.id = auth.uid()
$$;

comment on function public.current_branch_id() is
  'SCRUM-63: the branch the calling account belongs to (users.branch_id). NULL means "belongs to no branch": an employee with no branch reads nothing branch-scoped and may not file a request.';

grant execute on function public.current_branch_id() to authenticated;

-- ── 3. Branches: an employee sees their own branch only ───────────────────────────────────
-- SCRUM-53 opened this to the whole organization because `/requests`, `/schedules` and `/attendance`
-- need a branch filter and the pickers need names. An employee only reaches their own branch now;
-- a manager (OWNER/MANAGER) keeps the organization's list, which is what the SCRUM-61 read filters
-- browse.
drop policy if exists branches_select_authenticated on public.branches;
create policy branches_select_authenticated
  on public.branches
  for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (
      public.is_organization_manager()
      or id = public.current_branch_id()
    )
  );

-- ── 4. Requests: own rows, inside the caller's branch ─────────────────────────────────────
-- The employee half becomes `user_id = auth.uid() and branch_id = current_branch_id()`; the manager
-- half (SCRUM-60) is untouched.
drop policy if exists requests_select_authenticated on public.requests;
create policy requests_select_authenticated
  on public.requests
  for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (
      public.is_organization_manager()
      or (
        user_id = auth.uid()
        and branch_id = public.current_branch_id()
      )
    )
  );

-- A member files their own đơn, and an employee files it for the branch they belong to: an
-- unassigned account (`current_branch_id()` is null) can no longer file one at all, which is why
-- `CreateRequestUseCase` answers `403` with a sentence before the insert is attempted.
drop policy if exists requests_insert_own on public.requests;
create policy requests_insert_own
  on public.requests
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and status = 'PENDING'
    and organization_id = public.current_organization_id()
    and (
      public.is_organization_manager()
      or branch_id = public.current_branch_id()
    )
  );

-- ── 5. Attendance: own rows, inside the caller's branch ───────────────────────────────────
-- The mobile check-in inserts as the employee, so the insert policy is where "belongs to no branch
-- means no check-in" is enforced. `attendance_guard_self_update` (SCRUM-21) still blocks an employee
-- from changing the facts of their own row.
drop policy if exists attendance_select_authenticated on public.attendance;
create policy attendance_select_authenticated
  on public.attendance
  for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (
      public.is_organization_manager()
      or (
        employee_id = auth.uid()
        and branch_id = public.current_branch_id()
      )
    )
  );

drop policy if exists attendance_insert_own on public.attendance;
create policy attendance_insert_own
  on public.attendance
  for insert
  to authenticated
  with check (
    employee_id = auth.uid()
    and organization_id = public.current_organization_id()
    and (
      public.is_organization_manager()
      or branch_id = public.current_branch_id()
    )
  );

drop policy if exists attendance_update_own on public.attendance;
create policy attendance_update_own
  on public.attendance
  for update
  to authenticated
  using (
    employee_id = auth.uid()
    and organization_id = public.current_organization_id()
    and (
      public.is_organization_manager()
      or branch_id = public.current_branch_id()
    )
  )
  with check (
    employee_id = auth.uid()
    and organization_id = public.current_organization_id()
    and (
      public.is_organization_manager()
      or branch_id = public.current_branch_id()
    )
  );

-- ── 6. The schedule: own assignments, inside the caller's branch ──────────────────────────
drop policy if exists shift_assignments_select_authenticated on public.shift_assignments;
create policy shift_assignments_select_authenticated
  on public.shift_assignments
  for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (
      public.is_organization_manager()
      or (
        employee_id = auth.uid()
        and branch_id = public.current_branch_id()
      )
    )
  );

-- ── Verify ───────────────────────────────────────────────────────────────────────────────
-- 1. The column, its key and the helper. `prosecdef` must be true.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'users' and column_name = 'branch_id';

select proname, prosecdef, pg_get_functiondef(oid) as definition
from pg_proc
where proname = 'current_branch_id';

-- 2. Who belongs where (an account with `branch_id = null` is unassigned).
select u.full_name, u.role, u.is_active, b.name as branch
from public.users u
left join public.branches b on b.id = u.branch_id
order by u.role, u.full_name;

-- 3. Read the policies: each one that used to test only `employee_id`/`user_id` now also asks which
--    branch the caller belongs to, and no clause of SCRUM-53/60 was lost (compare `organization_id`,
--    `employee_id`/`user_id = auth.uid()`, `status = 'PENDING'`, `is_organization_manager()`).
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('branches', 'requests', 'attendance', 'shift_assignments')
order by tablename, policyname;

-- 4. Signed in as an EMPLOYEE with `branch_id` set, these must count only their own branch's rows,
--    and a row of another branch must stay invisible even when it is their own:
--      select count(*) from public.branches;            -- 1
--      select count(*) from public.attendance;          -- own rows, own branch
--      select count(*) from public.shift_assignments;   -- own rows, own branch
--      select name, branch_id from public.requests;     -- own đơn, own branch
--    Signed in as the same account with `branch_id = null`: all four are zero, and
--    `insert into public.requests (...) values (...)` is refused by the insert policy.

-- ── After running this ───────────────────────────────────────────────────────────────────
-- 1. Assign every employee a branch on `/staff` (owner only): the "Chi nhánh" column. Until then an
--    employee sees no branch-scoped data and cannot file a đơn — deliberately, because an account
--    that belongs nowhere must not silently reach a branch it was never attached to.
-- 2. Existing rows are not moved: an employee who already has attendance or schedule rows at another
--    branch loses sight of those rows until the owner either assigns them that branch or the schedule
--    is corrected. Nothing is deleted.
-- 3. Deleting a branch sets the `branch_id` of its staff back to `null` (`on delete set null`), so
--    reassign them afterwards; `branches_guard_delete` still refuses to delete a branch that has
--    attendance, schedule, facility or revenue rows.



