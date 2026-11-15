import type { Contract } from "@/lib/domain/entities/CustomerContract";
import { CrmConflictError } from "@/lib/domain/errors/CrmConflictError";
import { CrmInputError } from "@/lib/domain/errors/CrmInputError";
import { CrmNotFoundError } from "@/lib/domain/errors/CrmNotFoundError";
import type { ICustomerContractRepository } from "@/lib/domain/repositories/ICustomerContractRepository";
import { assertTerminationInput } from "@/lib/usecases/crmValidation";

/**
 * Chấm dứt một hợp đồng (SCRUM-101): ghi ngày và lý do, không xoá hàng.
 *
 * A terminated contract keeps its invoices, emails and service history, which is exactly why the flow is
 * "đóng" rather than "xoá" — the delete guard refuses a contract that still has any of them. Terminating
 * twice is a `409` so the first reason is not silently replaced.
 */
export class TerminateContractUseCase {
  constructor(private readonly repository: ICustomerContractRepository) {}

  async execute(
    id: string,
    terminatedOn: string,
    reason: string,
  ): Promise<Contract> {
    assertTerminationInput(terminatedOn, reason);

    const stored = await this.repository.findById(id);

    if (!stored) {
      throw new CrmNotFoundError(
        "Không tìm thấy hợp đồng này trong tổ chức của bạn.",
      );
    }

    if (stored.status === "TERMINATED") {
      throw new CrmConflictError("Hợp đồng này đã được chấm dứt trước đó.");
    }

    if (terminatedOn < stored.start_date) {
      throw new CrmInputError(
        `terminatedOn không thể trước ngày bắt đầu hợp đồng (${stored.start_date}).`,
      );
    }

    return this.repository.terminate(id, terminatedOn, reason);
  }
}
