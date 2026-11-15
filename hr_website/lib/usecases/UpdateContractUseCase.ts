import type {
  Contract,
  UpdateContractInput,
} from "@/lib/domain/entities/CustomerContract";
import { CrmConflictError } from "@/lib/domain/errors/CrmConflictError";
import { CrmNotFoundError } from "@/lib/domain/errors/CrmNotFoundError";
import type { ICustomerContractRepository } from "@/lib/domain/repositories/ICustomerContractRepository";
import { assertContractDraft, trimOrNull } from "@/lib/usecases/crmValidation";

/**
 * Sửa một hợp đồng (SCRUM-101).
 *
 * A terminated contract is a closed record: its dates and price must not move, because a renewal creates a
 * new row instead. The status itself is never edited here — "Chấm dứt" is the one action that closes a
 * contract, so the reason and the day are recorded in `terminated_on` / `termination_reason`.
 */
export class UpdateContractUseCase {
  constructor(private readonly repository: ICustomerContractRepository) {}

  async execute(input: UpdateContractInput): Promise<Contract> {
    assertContractDraft(input);

    const stored = await this.repository.findById(input.id);

    if (!stored) {
      throw new CrmNotFoundError(
        "Không tìm thấy hợp đồng này trong tổ chức của bạn.",
      );
    }

    if (stored.status === "TERMINATED") {
      throw new CrmConflictError(
        "Hợp đồng đã chấm dứt nên không sửa được. Tạo hợp đồng gia hạn nếu khách quay lại.",
      );
    }

    return this.repository.update({
      ...input,
      contractNo: input.contractNo.trim(),
      note: trimOrNull(input.note),
      // The chain is decided when the renewal is created; editing a contract must not rewrite it.
      renewsContractId: stored.renews_contract_id,
    });
  }
}
