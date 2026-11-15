import type { ICustomerContractRepository } from "@/lib/domain/repositories/ICustomerContractRepository";

/**
 * Xoá một hợp đồng tạo nhầm (SCRUM-101).
 *
 * The database refuses this as soon as the row has a logged e-mail, a service or a reminder — at that point
 * it is evidence and "Chấm dứt" is the way to close it. That refusal is a `409` from the guard trigger, so
 * this use case only delegates.
 */
export class DeleteContractUseCase {
  constructor(private readonly repository: ICustomerContractRepository) {}

  async execute(id: string): Promise<void> {
    await this.repository.remove(id);
  }
}
