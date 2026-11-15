import type { Customer, UpdateCustomerInput } from "@/lib/domain/entities/Customer";
import type { ICustomerRepository } from "@/lib/domain/repositories/ICustomerRepository";
import { assertCustomerInput, trimOrNull } from "@/lib/usecases/crmValidation";

/** Sửa hồ sơ một khách hàng (SCRUM-101); the record is replaced, like `PUT /api/branches/[id]`. */
export class UpdateCustomerUseCase {
  constructor(private readonly repository: ICustomerRepository) {}

  async execute(id: string, input: UpdateCustomerInput): Promise<Customer> {
    assertCustomerInput(input);

    return this.repository.update(id, {
      ...input,
      companyName: input.companyName.trim(),
      appName: input.appName.trim(),
      contactEmail: input.contactEmail.trim(),
      contactName: trimOrNull(input.contactName),
      contactPhone: trimOrNull(input.contactPhone),
      address: trimOrNull(input.address),
      taxCode: trimOrNull(input.taxCode),
      notes: trimOrNull(input.notes),
    });
  }
}
