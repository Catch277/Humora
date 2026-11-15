import type { IPayrollRepository } from "@/lib/domain/repositories/IPayrollRepository";

/**
 * Marks the employee's khiếu nại against a payslip as handled (SCRUM-90).
 *
 * Only the owner may do it (`payroll_require_owner`), and only while a dispute is actually open — otherwise
 * `resolve_payslip_dispute` answers `PAYSLIP_NO_OPEN_DISPUTE`, which the route maps to `409` so the screen
 * can say "phiếu này không còn khiếu nại" instead of reporting a generic failure.
 */
export class ResolvePayslipDisputeUseCase {
  constructor(private readonly payrollRepository: IPayrollRepository) {}

  async execute(payslipId: string): Promise<void> {
    await this.payrollRepository.resolveDispute(payslipId);
  }
}
