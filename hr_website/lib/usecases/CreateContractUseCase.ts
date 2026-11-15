import type {
  Contract,
  CreateContractInput,
} from "@/lib/domain/entities/CustomerContract";
import type { ICustomerContractRepository } from "@/lib/domain/repositories/ICustomerContractRepository";
import { assertContractDraft, trimOrNull } from "@/lib/usecases/crmValidation";

/**
 * Ghi nhận một hợp đồng đã chốt (SCRUM-101, C4).
 *
 * `monthlyFee` is not part of the input on purpose: it is a generated column, so the database multiplies
 * price × headcount and floors it at the quotation minimum. A duplicate contract number is a unique index,
 * translated by the repository into a `409` that names the field.
 */
export class CreateContractUseCase {
  constructor(private readonly repository: ICustomerContractRepository) {}

  async execute(input: CreateContractInput): Promise<Contract> {
    assertContractDraft(input);

    return this.repository.create({
      ...input,
      contractNo: input.contractNo.trim(),
      note: trimOrNull(input.note),
    });
  }
}
