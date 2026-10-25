import type { IPayrollRepository } from "@/lib/domain/repositories/IPayrollRepository";

/**
 * Creates (or rewrites) the DRAFT payslips of one month (SCRUM-90).
 *
 * Everything the generator must decide — who has a rate, which ca count, how many minutes they are worth,
 * whether a payslip is already published — is decided inside `generate_payslips`, in one transaction, using
 * the same `payroll_work_lines` the employee's estimate uses. This use case therefore has nothing to add
 * but the answer: how many drafts the month now has.
 */
export class GeneratePayslipsUseCase {
  constructor(private readonly payrollRepository: IPayrollRepository) {}

  async execute(input: {
    periodStart: string;
    employeeId?: string;
  }): Promise<{ drafts: number }> {
    const drafts = await this.payrollRepository.generate(
      input.periodStart,
      input.employeeId,
    );

    return { drafts };
  }
}
