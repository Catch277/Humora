import { PAYSLIP_DISPUTE_NOTE_LENGTH } from "@/lib/domain/entities/Payslip";
import { PayrollInputError } from "@/lib/domain/errors/PayrollInputError";
import type { IPayrollRepository } from "@/lib/domain/repositories/IPayrollRepository";

/**
 * The employee's khiếu nại against their own published payslip (SCRUM-90).
 *
 * A dispute is a request to look again, not an edit: the payslip stays exactly as published while the note
 * is stored, the owners are notified (`payslip_disputed`), and a payslip with an open dispute is HELD by
 * `publish_payslips` — so a disputed figure never becomes final. The note is the sentence the owner reads,
 * hence the length rule is enforced here and in `dispute_payslip`.
 */
export class DisputePayslipUseCase {
  constructor(private readonly payrollRepository: IPayrollRepository) {}

  async execute(input: { payslipId: string; note: string }): Promise<void> {
    const note = input.note.trim();

    if (note.length < PAYSLIP_DISPUTE_NOTE_LENGTH.min) {
      throw new PayrollInputError(
        `Vui lòng mô tả nội dung thắc mắc (ít nhất ${PAYSLIP_DISPUTE_NOTE_LENGTH.min} ký tự).`,
      );
    }

    await this.payrollRepository.dispute(input.payslipId, note);
  }
}
