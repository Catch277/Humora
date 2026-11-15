/**
 * The row the action names does not exist, or RLS hides it from the caller (SCRUM-90): a payslip id from
 * another organization, an item of a published payslip, or an employee with no account.
 *
 * The RPCs answer `P0002` for all of those, so the message is carried in from the token
 * (`lib/domain/payrollMessages.ts`) instead of being restated here.
 */
export class PayrollNotFoundError extends Error {
  constructor(message = "Không tìm thấy dữ liệu lương cần thao tác.") {
    super(message);
    this.name = "PayrollNotFoundError";
  }
}
