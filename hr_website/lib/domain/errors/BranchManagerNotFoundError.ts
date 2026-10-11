/**
 * `manager_id` names an account the caller cannot see — it does not exist, or it belongs to another
 * organization (RLS scopes `users` to the caller's own). The API answers `400` instead of writing a
 * foreign key that would either fail later or point at somebody the branch does not employ.
 */
export class BranchManagerNotFoundError extends Error {
  constructor() {
    super("manager_id must reference an account of your organization.");
    this.name = "BranchManagerNotFoundError";
  }
}
