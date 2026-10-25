import { PAYSLIP_VOID_REASON_LENGTH } from "@/lib/domain/entities/Payslip";
import { PayrollInputError } from "@/lib/domain/errors/PayrollInputError";
import type { IPayrollRepository } from "@/lib/domain/repositories/IPayrollRepository";

/**
 * Withdraws a DRAFT or a PUBLISHED payslip (SCRUM-90).
 *
 * This is the only way to correct a published payslip: its numbers are frozen, so the owner voids it (with
 * a reason that stays in `payroll_audit_log`) and generates the month again. The reason is checked here *and*
 * in `void_payslip`, because the length is a rule about the record rather than about the HTTP body — the
 * screen that shows it later needs a sentence it can read.
 */
export class VoidPayslipUseCase {
  constructor(private readonly payrollRepository: IPayrollRepository) {}

  async execute(input: { payslipId: string; reason: string }): Promise<void> {
    const reason = input.reason.trim();

    if (reason.length < PAYSLIP_VOID_REASON_LENGTH.min) {
      throw new PayrollInputError(
        `Vui lòng nhập lý do huỷ phiếu (ít nhất ${PAYSLIP_VOID_REASON_LENGTH.min} ký tự).`,
      );
    }

    await this.payrollRepository.voidPayslip(input.payslipId, reason);
  }
}
