/**
 * The caller is a manager but does not head this branch (SCRUM-61): `branches.manager_id` names
 * somebody else, or names nobody at all. Only the organization's OWNER works across every branch, so
 * a manager who heads no branch manages nothing until the owner assigns them one.
 *
 * Answers `403`, and the database repeats the rule through `public.heads_branch()`.
 */
export class BranchForbiddenError extends Error {
  constructor() {
    super("You may only manage the branch you are the chi nhánh trưởng of.");
    this.name = "BranchForbiddenError";
  }
}
