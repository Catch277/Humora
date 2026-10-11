-- SCRUM-68 — the organization's owner does not clock in.
--
-- Check-in and check-out used to be the mobile app's business alone; the web app now records both
-- (`POST /api/attendance/check-in` / `POST /api/attendance/check-out`): an EMPLOYEE checks in against a
-- ca they are scheduled for, a MANAGER against a branch they head. The organization's OWNER is excluded
-- from timekeeping — they stand above the operation — which is why `attendance:checkin` is filtered out
-- of their capabilities in `lib/accessPolicy.ts` and `RecordCheckInUseCase` refuses them as well.
--
-- This script is the database half of that rule, the third layer of the shape SCRUM-59/61 describe.
-- Without it a hand-written PostgREST insert as the owner would still succeed, because
-- `is_organization_manager()` is true for them.
--
-- Applied by hand: Supabase Dashboard → SQL Editor.
-- Prerequisites: SCRUM-59 (`is_organization_owner()` / `is_organization_manager()`) and SCRUM-63 (whose
-- `attendance_insert_own` is restated verbatim below, with the one added clause).
--
-- Nothing else changes: `attendance_select_authenticated` and `attendance_update_own` keep SCRUM-63's
-- definitions, so an owner who already carries a legacy row still reads and edits it.

-- ── Check-in: one's own row, inside the organization and the caller's branch, never an owner ────────
-- SCRUM-63's condition plus `not public.is_organization_owner()`. Every original clause is kept
-- (`employee_id = auth.uid()`, `organization_id = current_organization_id()` and the manager branch
-- bypass): dropping one while re-creating the policy would be a silent security regression.
drop policy if exists attendance_insert_own on public.attendance;

create policy attendance_insert_own
  on public.attendance
  for insert
  to authenticated
  with check (
    employee_id = auth.uid()
    and organization_id = public.current_organization_id()
    and not public.is_organization_owner()
    and (
      public.is_organization_manager()
      or branch_id = public.current_branch_id()
    )
  );

-- Verification: the restated policy must still name every clause above. Run it after applying and check
-- that the expression contains `employee_id = auth.uid()`, `current_organization_id()`,
-- `is_organization_owner()` and `is_organization_manager()`.
-- select pg_get_expr(polwithcheck, polrelid)
-- from pg_policy
-- where polname = 'attendance_insert_own';
