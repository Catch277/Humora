import type { AppRole } from "@/lib/domain/roles";

/**
 * A row of the staff directory (SCRUM-24). Deliberately a separate shape from `User`, which the
 * session endpoint reads: the login path must keep working even before the scripts that add
 * `is_active` are applied, so it never selects this column.
 */
export interface StaffMember {
  id: string;
  full_name: string;
  /**
   * The raw `users.role` column. It is a `string` rather than an `AppRole` because a database that
   * has not run `SCRUM-59_role_model.sql` still answers the pre-rename `CHU`; compare it through
   * `normalizeRole`/`can` from `lib/domain/roles.ts`, never with `===`.
   */
  role: string;
  is_active: boolean;
  created_at: string;
  /**
   * The branch the account belongs to (SCRUM-63); `null` means it is not assigned yet, which is what
   * keeps an employee out of every branch-scoped read.
   *
   * Unlike `is_active`, this column is *not* optional for a deployed build: `GET /api/auth/session`
   * selects it (the shell needs to know the caller's branch), so a database that has not run
   * `SCRUM-63_employee_branch.sql` answers `500 ... column users.branch_id does not exist` on every
   * authenticated route. Run the script before shipping the build that carries it.
   */
  branch_id: string | null;
}

export interface UpdateStaffInput {
  /** One of `APP_ROLES` — the role vocabulary lives in `lib/domain/roles.ts`. */
  role: AppRole;
  isActive: boolean;
  /**
   * The branch to attach the account to, or `null` to unassign it. Omitted keeps the current value,
   * which is what a client that predates SCRUM-63 sends (see `UpdateStaffUseCase`).
   */
  branchId?: string | null;
}