import type { AddPayslipItemInput } from "@/lib/domain/entities/PayslipItem";
import { PayrollInputError } from "@/lib/domain/errors/PayrollInputError";
import type { IPayrollRepository } from "@/lib/domain/repositories/IPayrollRepository";

/**
 * Adds a phụ cấp / thưởng / khấu trừ to a DRAFT payslip (SCRUM-90).
 *
 * The label is trimmed here because it is the sentence the employee reads on their payslip, and
 * `add_payslip_item` stores `btrim(p_label)` — trimming twice is harmless, while a label of spaces would
 * otherwise travel to the database just to be refused by `char_length(btrim(label)) between 1 and 80`.
 */
export class AddPayslipItemUseCase {
  constructor(private readonly payrollRepository: IPayrollRepository) {}

  async execute(input: {
    payslipId: string;
    item: AddPayslipItemInput;
  }): Promise<{ id: string }> {
    const label = input.item.label.trim();

    if (!label) {
      throw new PayrollInputError("Vui lòng nhập tên khoản mục.");
    }

    const id = await this.payrollRepository.addItem(input.payslipId, {
      ...input.item,
      code: input.item.code.trim().toUpperCase(),
      label,
    });

    return { id };
  }
}
