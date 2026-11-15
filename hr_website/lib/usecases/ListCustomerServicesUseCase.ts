import type {
  CustomerServiceFilters,
  ServiceOverview,
} from "@/lib/domain/entities/CustomerService";
import type { ICustomerServiceRepository } from "@/lib/domain/repositories/ICustomerServiceRepository";

/** Danh sách bảo hành/bảo trì (SCRUM-102); `next_due_on` and the two states come from the RPC. */
export class ListCustomerServicesUseCase {
  constructor(private readonly repository: ICustomerServiceRepository) {}

  async execute(filters: CustomerServiceFilters): Promise<ServiceOverview[]> {
    return this.repository.overview(filters);
  }
}
