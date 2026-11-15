import type {
  MaintenanceVisit,
  MaintenanceVisitFilters,
} from "@/lib/domain/entities/MaintenanceVisit";
import type { ICustomerServiceRepository } from "@/lib/domain/repositories/ICustomerServiceRepository";

/** Lịch sử bảo trì, lọc theo dịch vụ hoặc khách ở server (SCRUM-102). */
export class ListMaintenanceVisitsUseCase {
  constructor(private readonly repository: ICustomerServiceRepository) {}

  async execute(filters: MaintenanceVisitFilters): Promise<MaintenanceVisit[]> {
    return this.repository.visits(filters);
  }
}
