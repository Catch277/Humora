import type { UpdatePayProfileInput } from "@/lib/domain/entities/PayProfile";
import type { IPayrollRepository } from "@/lib/domain/repositories/IPayrollRepository";

/**
 * Corrects one stored đơn giá giờ (SCRUM-92).
 *
 * Like `SetPayProfileUseCase`, no rule is repeated here: `update_pay_profile` starts with
 * `payroll_require_owner()`, scopes the row to the caller's organization and refuses to touch a rate that
 * belongs to the organization's owner. Trimming the note is the only thing TypeScript adds, because the
 * column has no length constraint and a payload of spaces should store `null` rather than `'   '`.
 */
export class UpdatePayProfileUseCase {
  constructor(private readonly payrollRepository: IPayrollRepository) {}

  async execute(input: UpdatePayProfileInput): Promise<{ id: string }> {
    const id = await this.payrollRepository.updateProfile({
      ...input,
      note: input.note?.trim() || null,
    });

    return { id };
  }
}
