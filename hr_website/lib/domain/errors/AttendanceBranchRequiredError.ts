/**
 * A manager checked in without naming a branch (SCRUM-68). Unlike an employee — whose branch comes from
 * `users.branch_id` — a manager's scope is `branches.manager_id`, so the branch they are clocking in at
 * has to be stated. The screen always sends it (the picker has no empty option), which makes this a
 * malformed request rather than a `403`.
 */
export class AttendanceBranchRequiredError extends Error {
  constructor() {
    super("branch_id is required when a manager checks in.");
    this.name = "AttendanceBranchRequiredError";
  }
}
