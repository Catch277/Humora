/**
 * `manager_id` names an account that may not head a branch: only a `MANAGER` runs a branch (SCRUM-61
 * as narrowed by SCRUM-63), so an `EMPLOYEE` — and the organization's `OWNER`, who sits above every
 * branch rather than belonging to one — is refused with `400`, which is the same answer the picker
 * gives by not offering them.
 *
 * It matters beyond tidiness: the branch scope in the database asks `heads_branch(branch_id)`. Naming
 * somebody with no scope of their own would either grant nothing (an employee) or hide which branch
 * is actually unattended (the owner), so both layers refuse it.
 */
export class BranchManagerRoleError extends Error {
  constructor() {
    super("manager_id must reference a MANAGER account.");
    this.name = "BranchManagerRoleError";
  }
}
