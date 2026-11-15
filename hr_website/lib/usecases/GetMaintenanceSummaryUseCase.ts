import type { MaintenanceSummary } from "@/lib/domain/entities/MaintenanceSummary";
import type { ICustomerServiceRepository } from "@/lib/domain/repositories/ICustomerServiceRepository";

/** KPI strip of `/maintenance` (SCRUM-102): one `get_maintenance_summary()` call. */
export class GetMaintenanceSummaryUseCase {
  constructor(private readonly repository: ICustomerServiceRepository) {}

  async execute(): Promise<MaintenanceSummary> {
    return this.repository.summary();
  }
}
