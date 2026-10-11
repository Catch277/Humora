export class ShiftRegistrationNotFoundError extends Error {
  constructor(message = "Shift registration not found.") {
    super(message);
    this.name = "ShiftRegistrationNotFoundError";
  }
}
