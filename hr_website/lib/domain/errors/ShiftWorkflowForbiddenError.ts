export class ShiftWorkflowForbiddenError extends Error {
  constructor(message = "You may not perform this action on shifts.") {
    super(message);
    this.name = "ShiftWorkflowForbiddenError";
  }
}
