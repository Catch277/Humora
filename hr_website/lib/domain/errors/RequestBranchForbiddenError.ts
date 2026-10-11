/**
 * An employee filed a request for a branch that is not theirs (SCRUM-63). `requests_insert_own`
 * refuses the row in the database; the use case answers `403` first so the client gets a sentence
 * instead of a policy that silently matched nothing.
 */
export class RequestBranchForbiddenError extends Error {
  constructor() {
    super("A request may only be filed for the branch your account belongs to.");
    this.name = "RequestBranchForbiddenError";
  }
}
