/**
 * The payslip is in a state that forbids the action (SCRUM-90) — it is already published, it is void, it
 * still carries an open khiếu nại, or the amount would break an invariant. The database raises this for a
 * *business* conflict, not for a malformed body, so the route answers `409` and the screen can say
 * "tải lại" instead of "kiểm tra lại nội dung".
 */
export class PayrollConflictError extends Error {
  constructor(message = "Phiếu lương đang ở trạng thái không cho phép thao tác này.") {
    super(message);
    this.name = "PayrollConflictError";
  }
}
