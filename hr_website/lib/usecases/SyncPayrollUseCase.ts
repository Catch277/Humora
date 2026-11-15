import type { PayrollSyncResult } from "@/lib/domain/entities/PayrollReconciliation";
import type { IPayrollRepository } from "@/lib/domain/repositories/IPayrollRepository";

/**
 * Đồng bộ lại lương của một tháng (SCRUM-99).
 *
 * The one rule that belongs to this layer: **a dry run is the default**. `apply` has to be `true` on purpose,
 * because the alternative — a caller that forgot the flag regenerating a month of money — is the kind of
 * surprise a payroll screen must never produce. Everything else (which rows need it, what a published payslip
 * means, whether the month is in the future) is decided by `payroll_reconcile` / `payroll_sync` in SQL.
 */
export class SyncPayrollUseCase {
  constructor(private readonly payrollRepository: IPayrollRepository) {}

  async execute(input: {
    periodStart: string;
    apply?: boolean;
    employeeId?: string;
  }): Promise<PayrollSyncResult> {
    return this.payrollRepository.sync(input.periodStart, {
      apply: input.apply === true,
      employeeId: input.employeeId,
    });
  }
}
