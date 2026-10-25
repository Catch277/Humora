export class ShiftWorkflowStateError extends Error {
  constructor(message = "Yêu cầu đang ở trạng thái không cho phép thao tác này.") {
    super(message);
    this.name = "ShiftWorkflowStateError";
  }
}
