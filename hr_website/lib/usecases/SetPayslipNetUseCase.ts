import type { SetPayslipNetInput } from "@/lib/domain/entities/Payslip";
import type { IPayrollRepository } from "@/lib/domain/repositories/IPayrollRepository";

/**
 * Chốt lương thực nhận (SCRUM-93): makes one DRAFT payslip pay exactly the figure the owner typed.
 *
 * No rule is repeated here — `set_payslip_net` starts with `payroll_require_owner()`, scopes the row to the
 * caller's organization and refuses anything that is not a DRAFT. The only thing TypeScript adds is trimming
 * the note, because a payload of spaces should store `null` rather than `'   '`.
 */
export class SetPayslipNetUseCase {
  constructor(private readonly payrollRepository: IPayrollRepository) {}

  async execute(
    payslipId: string,
    input: SetPayslipNetInput,
  ): Promise<{ net_amount: number }> {
    const net = await this.payrollRepository.setNet(payslipId, {
      ...input,
      note: input.note?.trim() || null,
    });

    return { net_amount: net };
  }
}
