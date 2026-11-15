import type { ICustomerServiceRepository } from "@/lib/domain/repositories/ICustomerServiceRepository";

/**
 * Xoá một dịch vụ (SCRUM-102).
 *
 * Its maintenance visits go with it (`on delete cascade`): they describe that service, so keeping them would
 * leave a history nobody can open. A contract's reminder trail survives with its `service_id` set to null.
 */
export class DeleteCustomerServiceUseCase {
  constructor(private readonly repository: ICustomerServiceRepository) {}

  async execute(id: string): Promise<void> {
    await this.repository.remove(id);
  }
}
