export class ShiftWorkflowConflictError extends Error {
  constructor(message = "Ca làm việc bị trùng với lịch đã có.") {
    super(message);
    this.name = "ShiftWorkflowConflictError";
  }
}
