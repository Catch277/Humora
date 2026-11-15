import type { ICustomerContractRepository } from "@/lib/domain/repositories/ICustomerContractRepository";

/**
 * Xoá một dòng nhật ký email ghi nhầm (SCRUM-101).
 *
 * There is no update: correcting a subject means deleting the wrong row and logging it again, which is what
 * keeps the trail "what was exchanged" rather than "what somebody last edited it to".
 */
export class DeleteCustomerEmailUseCase {
  constructor(private readonly repository: ICustomerContractRepository) {}

  async execute(id: string): Promise<void> {
    await this.repository.removeEmail(id);
  }
}
