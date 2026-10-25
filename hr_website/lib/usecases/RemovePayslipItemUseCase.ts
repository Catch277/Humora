import { PayrollConflictError } from "@/lib/domain/errors/PayrollConflictError";
import { PayrollNotFoundError } from "@/lib/domain/errors/PayrollNotFoundError";
import type { IPayrollRepository } from "@/lib/domain/repositories/IPayrollRepository";

/**
 * Removes a MANUAL item from a DRAFT payslip (SCRUM-90).
 *
 * The pair `(payslipId, itemId)` is checked before the write, so the endpoint cannot be used to delete an
 * item through the wrong payslip's URL — the id in the path is part of the address, not decoration.
 *
 * The database keeps the fixed allowance (`source = 'AUTO'`) out of reach on purpose: it is the rule's own
 * output and is rewritten on the next generation, so deleting it would only be undone. A `MANUAL` item of a
 * published payslip cannot go either — the whole payslip is frozen (`payslip_children_guard`), which is why
 * that case is a `409` with its own sentence rather than a "not found".
 */
export class RemovePayslipItemUseCase {
  constructor(private readonly payrollRepository: IPayrollRepository) {}

  async execute(input: { payslipId: string; itemId: string }): Promise<void> {
    const detail = await this.payrollRepository.findPayslip(input.payslipId);
    const item = detail?.items.find((entry) => entry.id === input.itemId);

    if (!item) {
      throw new PayrollNotFoundError(
        "Không tìm thấy khoản mục trong phiếu lương.",
      );
    }

    if (item.source !== "MANUAL") {
      throw new PayrollConflictError(
        "Khoản mục do hệ thống sinh ra (phụ cấp cố định) không xoá được.",
      );
    }

    await this.payrollRepository.removeItem(input.itemId);
  }
}
