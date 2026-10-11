export class RequestReviewForbiddenError extends Error {
  constructor() {
    super("Only a manager (OWNER/MANAGER) may review requests.");
    this.name = "RequestReviewForbiddenError";
  }
}
