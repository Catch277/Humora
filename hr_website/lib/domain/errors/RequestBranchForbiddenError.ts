/**
 * An employee filed a request for a branch that is not theirs (SCRUM-63). `requests_insert_own`
 * refuses the row in the database; the use case answers `403` first so the client gets a sentence
 * instead of a policy that silently matched nothing.
 */
export class RequestBranchForbiddenError extends Error {
  constructor() {
    super("Bạn chỉ gửi được đơn cho chi nhánh mà tài khoản của bạn thuộc về.");
    this.name = "RequestBranchForbiddenError";
  }
}
