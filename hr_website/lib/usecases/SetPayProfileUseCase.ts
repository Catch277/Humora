import type { SetPayProfileInput } from "@/lib/domain/entities/PayProfile";
import type { IPayrollRepository } from "@/lib/domain/repositories/IPayrollRepository";

/**
 * Stores one đơn giá giờ (SCRUM-90).
 *
 * The rule "only the organization's owner sets a rate" is not repeated here: `set_pay_profile` starts with
 * `payroll_require_owner()` and is the only writer of `pay_profiles`, so the database already answers
 * `PAYROLL_OWNER_ONLY` for anybody else. Duplicating the check in TypeScript would create a second copy of
 * the rule that could disagree with the one that actually decides.
 */
export class SetPayProfileUseCase {
  constructor(private readonly payrollRepository: IPayrollRepository) {}

  async execute(input: SetPayProfileInput): Promise<{ id: string }> {
    const id = await this.payrollRepository.setProfile({
      ...input,
      note: input.note?.trim() || null,
    });

    return { id };
  }
}
