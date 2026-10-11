export class ShiftAssignmentNotFoundError extends Error {
  constructor() {
    super("Shift assignment not found.");
    this.name = "ShiftAssignmentNotFoundError";
  }
}
