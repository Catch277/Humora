import type { PayrollReconciliation } from "@/lib/domain/entities/PayrollReconciliation";
import type { IPayrollRepository } from "@/lib/domain/repositories/IPayrollRepository";

/**
 * Đối soát một tháng lương (SCRUM-99).
 *
 * Nothing to add here on purpose: "does this month agree with the evidence" is answered by
 * `payroll_reconcile`, which recomputes the month with the same `payroll_work_lines()` the payslip uses. The
 * use case is one call and one answer; role and organization are decided by `payroll_require_owner()` inside
 * SQL, and a second copy of that rule in TypeScript would only be a second place to drift.
 */
export class ReconcilePayrollUseCase {
  constructor(private readonly payrollRepository: IPayrollRepository) {}

  async execute(input: {
    periodStart: string;
  }): Promise<PayrollReconciliation> {
    return this.payrollRepository.reconcile(input.periodStart);
  }
}
