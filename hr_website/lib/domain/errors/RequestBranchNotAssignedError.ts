/**
 * The caller's `users.branch_id` is null (SCRUM-63), so there is no branch they may file against.
 * The database refuses the insert for the same reason (`requests_insert_own` compares `branch_id`
 * with `current_branch_id()`), which without this error would surface as an opaque `500`.
 */
export class RequestBranchNotAssignedError extends Error {
  constructor() {
    super(
      "Your account is not assigned to a branch yet, so it cannot file a request.",
    );
    this.name = "RequestBranchNotAssignedError";
  }
}
