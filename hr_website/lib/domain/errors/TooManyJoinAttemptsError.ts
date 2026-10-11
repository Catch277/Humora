export class TooManyJoinAttemptsError extends Error {
  constructor() {
    super("Too many failed join attempts. Try again in an hour.");
    this.name = "TooManyJoinAttemptsError";
  }
}