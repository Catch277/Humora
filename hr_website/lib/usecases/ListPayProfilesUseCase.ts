import type { PayProfile } from "@/lib/domain/entities/PayProfile";
import type { IPayrollRepository } from "@/lib/domain/repositories/IPayrollRepository";

/**
 * The rates the caller may read (SCRUM-90): the whole organization's for the owner, their own row for
 * everybody else. RLS decides which of the two it is, so this use case has no rule of its own.
 */
export class ListPayProfilesUseCase {
  constructor(private readonly payrollRepository: IPayrollRepository) {}

  async execute(): Promise<PayProfile[]> {
    return this.payrollRepository.findProfiles();
  }
}
