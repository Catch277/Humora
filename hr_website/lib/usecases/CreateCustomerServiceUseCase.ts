import type {
  CustomerService,
  CustomerServiceInput,
} from "@/lib/domain/entities/CustomerService";
import type { ICustomerServiceRepository } from "@/lib/domain/repositories/ICustomerServiceRepository";
import { assertServiceInput, trimOrNull } from "@/lib/usecases/crmValidation";

/**
 * Ghi nhận một dịch vụ đã bán kèm bảo hành (SCRUM-102, C5).
 *
 * `warrantyEndOn` is not an input: it is a generated column, so the end date always matches the start date
 * and the number of months the customer bought. `maintenanceIntervalMonths = 0` means "no periodic
 * maintenance", which the read RPC reports as `NONE` instead of inventing a due date.
 */
export class CreateCustomerServiceUseCase {
  constructor(private readonly repository: ICustomerServiceRepository) {}

  async execute(input: CustomerServiceInput): Promise<CustomerService> {
    assertServiceInput(input);

    return this.repository.create({
      ...input,
      serviceName: input.serviceName.trim(),
      serialNo: trimOrNull(input.serialNo),
      note: trimOrNull(input.note),
    });
  }
}
