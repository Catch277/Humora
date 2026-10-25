export class ShiftWorkflowInputError extends Error {
  constructor(message = "Yêu cầu về ca làm việc không hợp lệ.") {
    super(message);
    this.name = "ShiftWorkflowInputError";
  }
}
