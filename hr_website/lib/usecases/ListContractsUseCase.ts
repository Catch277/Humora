import type {
  ContractFilters,
  ContractOverview,
} from "@/lib/domain/entities/CustomerContract";
import type { ICustomerContractRepository } from "@/lib/domain/repositories/ICustomerContractRepository";

/** Bảng hợp đồng (SCRUM-101); `EXPIRING`/`EXPIRED` are filtered by the RPC against Bangkok's today. */
export class ListContractsUseCase {
  constructor(private readonly repository: ICustomerContractRepository) {}

  async execute(filters: ContractFilters): Promise<ContractOverview[]> {
    return this.repository.overview(filters);
  }
}
