export class ShiftWorkflowForbiddenError extends Error {
  constructor(message = "Bạn không có quyền thực hiện thao tác này với ca làm việc.") {
    super(message);
    this.name = "ShiftWorkflowForbiddenError";
  }
}
