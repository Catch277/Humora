export class ShiftWorkflowConflictError extends Error {
  constructor(message = "The shift conflicts with the existing schedule.") {
    super(message);
    this.name = "ShiftWorkflowConflictError";
  }
}
