/**
 * The caller may not touch this organization's payroll (SCRUM-90).
 *
 * Every write RPC starts with `payroll_require_owner()`, which raises `PAYROLL_OWNER_ONLY` (`42501`):
 * money is the owner's business, a MANAGER and an EMPLOYEE never write a rate, a payslip or an item.
 * The route answers `403` with this sentence rather than letting the policy look like a `500`.
 */
export class PayrollForbiddenError extends Error {
  constructor(message = "Chỉ chủ sở hữu tổ chức mới được quản lý bảng lương.") {
    super(message);
    this.name = "PayrollForbiddenError";
  }
}
