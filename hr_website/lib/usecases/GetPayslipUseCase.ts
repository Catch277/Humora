import type { PayslipDetail } from "@/lib/domain/entities/PayslipDetail";
import { PayrollNotFoundError } from "@/lib/domain/errors/PayrollNotFoundError";
import type { IPayrollRepository } from "@/lib/domain/repositories/IPayrollRepository";

/**
 * One payslip with the lines and items that explain it (SCRUM-90).
 *
 * "Not there" and "not yours" are the same answer on purpose: a `DRAFT` is invisible to its employee and a
 * payslip of another organization is invisible to everybody, and telling the two apart would turn the
 * endpoint into a way to probe for ids.
 */
export class GetPayslipUseCase {
  constructor(private readonly payrollRepository: IPayrollRepository) {}

  async execute(id: string): Promise<PayslipDetail> {
    const detail = await this.payrollRepository.findPayslip(id);

    if (!detail) {
      throw new PayrollNotFoundError("Không tìm thấy phiếu lương.");
    }

    return detail;
  }
}
