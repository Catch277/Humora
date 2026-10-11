/**
 * Only the organization's OWNER may change who heads a branch (SCRUM-61). `manager_id` is what grants
 * a manager their branch, so a head editing it could hand the branch on — or take a second one.
 *
 * Answers `403`; `branches_guard_manager_change` repeats the rule in the database.
 */
export class BranchManagerChangeForbiddenError extends Error {
  constructor() {
    super("Only the organization's OWNER may change who heads a branch.");
    this.name = "BranchManagerChangeForbiddenError";
  }
}
