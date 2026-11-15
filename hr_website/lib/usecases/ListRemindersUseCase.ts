import type { ReminderItem } from "@/lib/domain/entities/CustomerReminder";
import type { ICustomerContractRepository } from "@/lib/domain/repositories/ICustomerContractRepository";
import type { ICustomerReminderRepository } from "@/lib/domain/repositories/ICustomerReminderRepository";
import type { ICustomerServiceRepository } from "@/lib/domain/repositories/ICustomerServiceRepository";
import { businessToday } from "@/lib/usecases/businessDay";
import { buildReminderQueue } from "@/lib/usecases/reminderQueue";

/**
 * "Việc cần làm" của C5 (SCRUM-102) — **suy ra**, không đọc từ một bảng hàng đợi.
 *
 * The three reads happen together so the queue, the KPI strip and the tables on `/maintenance` describe
 * the same day. `today` is injected (`Asia/Bangkok`) instead of read inside `buildReminderQueue`, which is
 * what keeps the pure function deterministic and the rule identical to the SQL functions' `today`.
 */
export class ListRemindersUseCase {
  constructor(
    private readonly contracts: ICustomerContractRepository,
    private readonly services: ICustomerServiceRepository,
    private readonly reminders: ICustomerReminderRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<ReminderItem[]> {
    const [contracts, services, logs] = await Promise.all([
      this.contracts.overview({}),
      this.services.overview({}),
      this.reminders.logs(),
    ]);

    return buildReminderQueue({
      contracts,
      services,
      logs,
      today: businessToday(this.now()),
    });
  }
}
