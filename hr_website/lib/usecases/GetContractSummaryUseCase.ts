import type { ContractSummary } from "@/lib/domain/entities/ContractSummary";
import type { ICustomerContractRepository } from "@/lib/domain/repositories/ICustomerContractRepository";

/** KPI strip of `/customers` (SCRUM-101): one `get_contract_summary()` call, no arithmetic here. */
export class GetContractSummaryUseCase {
  constructor(private readonly repository: ICustomerContractRepository) {}

  async execute(): Promise<ContractSummary> {
    return this.repository.summary();
  }
}
