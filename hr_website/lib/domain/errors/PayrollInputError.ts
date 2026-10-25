/**
 * The payload breaks a payroll rule the database enforces (SCRUM-90): a future month, a month that has
 * not finished, a void reason that is too short, a khiếu nại note outside `5..500`, or deductions that
 * exceed gross. The route parsers refuse most of these before the call; this error covers the ones only
 * the database can judge (it knows today in Asia/Bangkok and the current sums).
 */
export class PayrollInputError extends Error {
  constructor(message = "Dữ liệu lương không hợp lệ.") {
    super(message);
    this.name = "PayrollInputError";
  }
}
