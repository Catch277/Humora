import type {
  CustomerService,
  UpdateCustomerServiceInput,
} from "@/lib/domain/entities/CustomerService";
import type { ICustomerServiceRepository } from "@/lib/domain/repositories/ICustomerServiceRepository";
import { assertServiceInput, trimOrNull } from "@/lib/usecases/crmValidation";

/** Sửa một dịch vụ (SCRUM-102): thời hạn bảo hành, chu kỳ bảo trì, trạng thái theo dõi. */
export class UpdateCustomerServiceUseCase {
  constructor(private readonly repository: ICustomerServiceRepository) {}

  async execute(input: UpdateCustomerServiceInput): Promise<CustomerService> {
    assertServiceInput(input);

    return this.repository.update({
      ...input,
      serviceName: input.serviceName.trim(),
      serialNo: trimOrNull(input.serialNo),
      note: trimOrNull(input.note),
    });
  }
}
