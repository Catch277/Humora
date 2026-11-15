import type { CreateCustomerInput, Customer } from "@/lib/domain/entities/Customer";
import type { ICustomerRepository } from "@/lib/domain/repositories/ICustomerRepository";
import { assertCustomerInput, trimOrNull } from "@/lib/usecases/crmValidation";

/**
 * Thêm một khách hàng (SCRUM-101).
 *
 * The one rule this layer owns is the shape of the record (trimmed text, `""` → `null`, a valid contact
 * address). The duplicate company and duplicate e-mail rules stay in the database — they are unique indexes,
 * and `crmErrors.ts` turns each one into the sentence the dialog shows.
 */
export class CreateCustomerUseCase {
  constructor(private readonly repository: ICustomerRepository) {}

  async execute(input: CreateCustomerInput): Promise<Customer> {
    assertCustomerInput(input);

    return this.repository.create({
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
