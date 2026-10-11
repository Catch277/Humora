export class RequestNotFoundError extends Error {
  constructor() {
    super("Request not found.");
    this.name = "RequestNotFoundError";
  }
}
