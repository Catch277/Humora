import type {
  CustomerReminderLog,
  LogReminderInput,
} from "@/lib/domain/entities/CustomerReminder";

/**
 * Nhật ký nhắc khách (SCRUM-102). Append-only: there is no update and no delete, because the point of the
 * table is "what the customer was actually told".
 *
 * It is a *log*, not a queue: `ListRemindersUseCase` derives the to-do list and only asks this repository
 * for the latest `sent_at` per item.
 */
export interface ICustomerReminderRepository {
  logs(customerId?: string): Promise<CustomerReminderLog[]>;
  log(input: LogReminderInput): Promise<CustomerReminderLog>;
}
