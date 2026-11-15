import type {
  CustomerEmail,
  CustomerEmailFilters,
} from "@/lib/domain/entities/CustomerEmail";
import type { ICustomerContractRepository } from "@/lib/domain/repositories/ICustomerContractRepository";

/** Nhật ký email của C3 (SCRUM-101), lọc theo khách / hợp đồng / chiều ngay ở server. */
export class ListCustomerEmailsUseCase {
  constructor(private readonly repository: ICustomerContractRepository) {}

  async execute(filters: CustomerEmailFilters): Promise<CustomerEmail[]> {
    return this.repository.emails(filters);
  }
}
