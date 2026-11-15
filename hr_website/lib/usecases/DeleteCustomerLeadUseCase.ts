import type { ICustomerRepository } from "@/lib/domain/repositories/ICustomerRepository";

/** Xoá một yêu cầu demo ghi nhầm (SCRUM-101). */
export class DeleteCustomerLeadUseCase {
  constructor(private readonly repository: ICustomerRepository) {}

  async execute(id: string): Promise<void> {
    await this.repository.removeLead(id);
  }
}
