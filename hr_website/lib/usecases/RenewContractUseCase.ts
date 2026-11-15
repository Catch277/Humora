import type { Contract } from "@/lib/domain/entities/CustomerContract";
import type { RenewContractInput } from "@/lib/domain/entities/CustomerContract";
import { CrmInputError } from "@/lib/domain/errors/CrmInputError";
import { CrmNotFoundError } from "@/lib/domain/errors/CrmNotFoundError";
import type { ICustomerContractRepository } from "@/lib/domain/repositories/ICustomerContractRepository";
import { assertRenewalInput, trimOrNull } from "@/lib/usecases/crmValidation";

/**
 * Gia hạn một hợp đồng (SCRUM-101) — một **hợp đồng mới**, không phải sửa hợp đồng cũ.
 *
 * The old row stays untouched (and reads `EXPIRED` by itself once its end date passes); the new row copies
 * the customer, the plan, the price and the headcount as defaults and links back through
 * `renews_contract_id`. The only rule this layer adds: the new term must start after the old one ended, or
 * the two rows would describe the same days twice.
 */
export class RenewContractUseCase {
  constructor(private readonly repository: ICustomerContractRepository) {}

  async execute(input: RenewContractInput): Promise<Contract> {
    assertRenewalInput(input);

    const previous = await this.repository.findById(input.contractId);

    if (!previous) {
      throw new CrmNotFoundError(
        "Không tìm thấy hợp đồng cần gia hạn trong tổ chức của bạn.",
      );
    }

    if (input.startDate <= previous.end_date) {
      throw new CrmInputError(
        `startDate phải sau ngày kết thúc của hợp đồng cũ (${previous.end_date}).`,
      );
    }

    return this.repository.create({
      customerId: previous.customer_id,
      contractNo: input.contractNo.trim(),
      planCode: input.planCode,
      employeeCount: input.employeeCount,
      unitPrice: input.unitPrice,
      billingCycle: input.billingCycle,
      startDate: input.startDate,
      endDate: input.endDate,
      autoRenew: input.autoRenew,
      reminderDays: input.reminderDays,
      status: "ACTIVE",
      note: trimOrNull(input.note),
      renewsContractId: previous.id,
    });
  }
}
