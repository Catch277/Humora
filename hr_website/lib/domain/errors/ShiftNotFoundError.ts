export class ShiftNotFoundError extends Error {
  constructor() {
    super("Shift not found.");
    this.name = "ShiftNotFoundError";
  }
}
