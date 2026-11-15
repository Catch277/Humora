import type {
  CreateCustomerLeadInput,
  CustomerLead,
} from "@/lib/domain/entities/CustomerLead";
import type { ICustomerRepository } from "@/lib/domain/repositories/ICustomerRepository";
import { assertLeadInput, trimOrNull } from "@/lib/usecases/crmValidation";

/**
 * Ghi một yêu cầu demo / dùng thử (SCRUM-101, C3).
 *
 * The landing form posts to an external endpoint, so the owner may paste it here or take it by phone. The
 * record is a *queue entry*, not a customer: `status` tracks the conversation until somebody decides to add
 * a customer, and nothing in this table is invoiced or counted as revenue.
 */
export class CreateCustomerLeadUseCase {
  constructor(private readonly repository: ICustomerRepository) {}

  async execute(input: CreateCustomerLeadInput): Promise<CustomerLead> {
    assertLeadInput(input);

    return this.repository.createLead({
      ...input,
      companyName: input.companyName.trim(),
      contactEmail: input.contactEmail.trim(),
      contactName: trimOrNull(input.contactName),
      contactPhone: trimOrNull(input.contactPhone),
      planInterest: trimOrNull(input.planInterest),
      message: trimOrNull(input.message),
      note: trimOrNull(input.note),
    });
  }
}
