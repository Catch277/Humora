import type {
  CustomerEmail,
  LogCustomerEmailInput,
} from "@/lib/domain/entities/CustomerEmail";
import type { ICustomerContractRepository } from "@/lib/domain/repositories/ICustomerContractRepository";
import { assertEmailInput, trimOrNull } from "@/lib/usecases/crmValidation";

/**
 * Ghi lại một email đã trao đổi (SCRUM-101, C3).
 *
 * The app never reads the mailbox: this row is the record the owner typed/pasted, plus the Gmail thread link
 * so the next reader can open the original. Two rules live here — the counterpart must be a real address,
 * and a thread link must point at Gmail (the value ends up in an `href`, so any other scheme is refused).
 */
export class LogCustomerEmailUseCase {
  constructor(private readonly repository: ICustomerContractRepository) {}

  async execute(input: LogCustomerEmailInput): Promise<CustomerEmail> {
    assertEmailInput(input);

    return this.repository.logEmail({
      ...input,
      subject: input.subject.trim(),
      counterpartEmail: input.counterpartEmail.trim(),
      counterpartName: trimOrNull(input.counterpartName),
      gmailThreadId: trimOrNull(input.gmailThreadId),
      gmailMessageId: trimOrNull(input.gmailMessageId),
      gmailThreadUrl: trimOrNull(input.gmailThreadUrl),
      snippet: trimOrNull(input.snippet),
      body: trimOrNull(input.body),
    });
  }
}
