import type { IPayrollRepository } from "@/lib/domain/repositories/IPayrollRepository";

/**
 * The employee's own "đã xem, đúng số" acknowledgement (SCRUM-90).
 *
 * `acknowledge_payslip` writes `acknowledged_at` only on a PUBLISHED payslip that belongs to the caller, so
 * there is no id here that could acknowledge somebody else's pay — and pressing it twice keeps the first
 * timestamp (`coalesce(acknowledged_at, now())`) rather than moving the record of when it was seen.
 */
export class AcknowledgePayslipUseCase {
  constructor(private readonly payrollRepository: IPayrollRepository) {}

  async execute(payslipId: string): Promise<void> {
    await this.payrollRepository.acknowledge(payslipId);
  }
}
