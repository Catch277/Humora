import type { ICustomerServiceRepository } from "@/lib/domain/repositories/ICustomerServiceRepository";

/** Xoá một lần bảo trì ghi nhầm (SCRUM-102). */
export class DeleteMaintenanceVisitUseCase {
  constructor(private readonly repository: ICustomerServiceRepository) {}

  async execute(id: string): Promise<void> {
    await this.repository.removeVisit(id);
  }
}
