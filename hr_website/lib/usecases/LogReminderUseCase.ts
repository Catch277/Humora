import type {
  CustomerReminderLog,
  LogReminderInput,
} from "@/lib/domain/entities/CustomerReminder";
import type { ICustomerReminderRepository } from "@/lib/domain/repositories/ICustomerReminderRepository";
import { assertReminderInput, trimOrNull } from "@/lib/usecases/crmValidation";

/**
 * Ghi nhận một lần đã nhắc khách (SCRUM-102, C5).
 *
 * This is the only write on the reminder surface: the *list* of things to remind is derived, and pressing
 * "đã gửi" stores what was sent so the next reader sees "lần nhắc cuối". The unique index per item per day
 * makes a double click a `409` instead of a duplicate trail entry; the repository translates that sentence.
 */
export class LogReminderUseCase {
  constructor(private readonly repository: ICustomerReminderRepository) {}

  async execute(input: LogReminderInput): Promise<CustomerReminderLog> {
    assertReminderInput(input);

    return this.repository.log({
      ...input,
      subject: trimOrNull(input.subject),
      body: trimOrNull(input.body),
      note: trimOrNull(input.note),
    });
  }
}
