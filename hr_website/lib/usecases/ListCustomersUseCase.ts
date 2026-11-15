import type {
  CustomerFilters,
  CustomerOverview,
} from "@/lib/domain/entities/Customer";
import type { ICustomerRepository } from "@/lib/domain/repositories/ICustomerRepository";

/** The customer book of `/customers` (SCRUM-101); filtering happens in the RPC, not in the screen. */
export class ListCustomersUseCase {
  constructor(private readonly repository: ICustomerRepository) {}

  async execute(filters: CustomerFilters): Promise<CustomerOverview[]> {
    return this.repository.findAll(filters);
  }
}
