import type {
  CustomerLead,
  CustomerLeadFilters,
} from "@/lib/domain/entities/CustomerLead";
import type { ICustomerRepository } from "@/lib/domain/repositories/ICustomerRepository";

/** Hàng đợi yêu cầu demo / dùng thử (SCRUM-101, C3), lọc ở server theo trạng thái và từ khoá. */
export class ListCustomerLeadsUseCase {
  constructor(private readonly repository: ICustomerRepository) {}

  async execute(filters: CustomerLeadFilters): Promise<CustomerLead[]> {
    return this.repository.findLeads(filters);
  }
}
