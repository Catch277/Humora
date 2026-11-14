import type { IPayrollRepository } from "@/lib/domain/repositories/IPayrollRepository";

/**
 * Removes one stored đơn giá giờ (SCRUM-92).
 *
 * The rule "only the organization's owner" and the membership check both live in `delete_pay_profile`, which
 * also copies the row into `payroll_audit_log` before deleting it. Payroll amounts are snapshots, so a
 * published payslip is unaffected — the delete only decides what the generator will price next.
 */
export class DeletePayProfileUseCase {
  constructor(private readonly payrollRepository: IPayrollRepository) {}

  async execute(id: string): Promise<void> {
    await this.payrollRepository.deleteProfile(id);
  }
}
