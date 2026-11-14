import type { Payslip, PayslipFilters } from "@/lib/domain/entities/Payslip";
import type { IPayrollRepository } from "@/lib/domain/repositories/IPayrollRepository";

/**
 * The payslips of one month (SCRUM-90).
 *
 * The employee filter is a *narrowing*, never a permission: RLS already limits an EMPLOYEE and a MANAGER
 * to their own PUBLISHED row, so a caller who sends somebody else's `employee_id` simply gets an empty
 * list — the same answer the database gives, not a `403` the screen would have to explain.
 */
export class ListPayslipsUseCase {
  constructor(private readonly payrollRepository: IPayrollRepository) {}

  async execute(filters: PayslipFilters): Promise<Payslip[]> {
    return this.payrollRepository.findPayslips(filters);
  }
}
