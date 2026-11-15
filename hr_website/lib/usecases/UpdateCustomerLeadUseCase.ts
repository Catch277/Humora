import type {
  CustomerLead,
  UpdateCustomerLeadInput,
} from "@/lib/domain/entities/CustomerLead";
import type { ICustomerRepository } from "@/lib/domain/repositories/ICustomerRepository";
import { assertLeadPatchInput, trimOrNull } from "@/lib/usecases/crmValidation";

/**
 * Đổi trạng thái một yêu cầu demo (SCRUM-101, C3): mới → đã liên hệ → hẹn demo → đã chuyển thành khách /
 * từ chối, kèm ghi chú và khách hàng đã tạo (nếu có). Marking `CONVERTED` does not create the customer —
 * that is the owner's explicit `POST /api/customers`, and the id is stored here afterwards.
 */
export class UpdateCustomerLeadUseCase {
  constructor(private readonly repository: ICustomerRepository) {}

  async execute(
    id: string,
    input: UpdateCustomerLeadInput,
  ): Promise<CustomerLead> {
    assertLeadPatchInput(input);

    return this.repository.updateLead(id, {
      ...input,
      note: trimOrNull(input.note),
    });
  }
}
