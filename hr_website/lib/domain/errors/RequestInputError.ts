/**
 * A field of a submitted request is missing or too long. The route handler validates the payload by
 * hand and answers `400` itself, so this is the use case's own copy of the rule — the message names
 * the offending field, which is what makes the answer usable to the screen.
 */
export class RequestInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestInputError";
  }
}
