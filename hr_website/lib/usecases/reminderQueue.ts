import type { ContractOverview } from "@/lib/domain/entities/CustomerContract";
import type { ServiceOverview } from "@/lib/domain/entities/CustomerService";
import type {
  CustomerReminderLog,
  ReminderItem,
  ReminderKind,
} from "@/lib/domain/entities/CustomerReminder";
import { reminderDraft } from "@/lib/usecases/reminderTemplates";

/**
 * "Việc cần làm" của C5 (SCRUM-102) — **suy ra**, không lưu.
 *
 * Bốn nguồn, một danh sách:
 *
 *   1. hợp đồng đang trong cửa sổ nhắc (`EXPIRING`) → gia hạn,
 *   2. hợp đồng đã hết hạn chưa lâu → mời tiếp tục sử dụng,
 *   3. dịch vụ tới kỳ / quá kỳ bảo trì → đặt lịch bảo trì,
 *   4. bảo hành sắp hết → nhắc gia hạn bảo hành.
 *
 * Because nothing is stored, the list cannot go stale: a contract edited to a later end date simply stops
 * appearing, and a completed maintenance visit moves its service's next-due date by itself. The log is
 * consulted only to answer "lần cuối đã nhắc là khi nào", which is why this function is pure and takes
 * `today` instead of reading a clock.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `today` to `date` (negative when `date` has passed); both are `YYYY-MM-DD`. */
export function daysBetween(date: string, today: string): number {
  const target = Date.parse(`${date}T00:00:00Z`);
  const reference = Date.parse(`${today}T00:00:00Z`);

  if (Number.isNaN(target) || Number.isNaN(reference)) {
    return 0;
  }

  return Math.round((target - reference) / DAY_MS);
}

export type ReminderQueueInput = {
  contracts: ContractOverview[];
  services: ServiceOverview[];
  logs: CustomerReminderLog[];
  /** Today in Asia/Bangkok, `YYYY-MM-DD`. */
  today: string;
  /** How far ahead a renewal is worth mentioning; the contract's own `reminder_days` is applied by the RPC. */
  withinDays?: number;
  /** How long after a contract lapsed a "tiếp tục sử dụng" mail is still worth sending. */
  expiredGraceDays?: number;
};

function lastSentAt(
  logs: CustomerReminderLog[],
  kind: ReminderKind,
  match: { contractId?: string; serviceId?: string },
): string | null {
  let latest: string | null = null;

  for (const log of logs) {
    if (log.kind !== kind) {
      continue;
    }

    const sameItem = match.contractId
      ? log.contract_id === match.contractId
      : log.service_id === match.serviceId;

    if (!sameItem) {
      continue;
    }

    if (!latest || log.sent_at > latest) {
      latest = log.sent_at;
    }
  }

  return latest;
}

export function buildReminderQueue({
  contracts,
  services,
  logs,
  today,
  withinDays = 30,
  expiredGraceDays = 90,
}: ReminderQueueInput): ReminderItem[] {
  const items: ReminderItem[] = [];

  for (const contract of contracts) {
    const daysLeft = daysBetween(contract.end_date, today);
    const kind: ReminderKind | null =
      contract.effective_status === "EXPIRING" &&
      contract.days_to_end <= withinDays
        ? "RENEWAL"
        : contract.effective_status === "EXPIRED" &&
            daysLeft >= -expiredGraceDays
          ? "USAGE"
          : null;

    if (!kind) {
      continue;
    }

    const draft = reminderDraft({
      customerName: contract.customer_name,
      appName: contract.app_name,
      contactName: null,
      kind,
      dueOn: contract.end_date,
      daysLeft,
      itemLabel: `số ${contract.contract_no}`,
    });

    items.push({
      key: `${kind}:${contract.id}:${contract.end_date}`,
      kind,
      customerId: contract.customer_id,
      customerName: contract.customer_name,
      appName: contract.app_name,
      contactEmail: contract.contact_email,
      itemKind: "contract",
      itemId: contract.id,
      itemLabel: `HĐ ${contract.contract_no}`,
      dueOn: contract.end_date,
      daysLeft,
      lastSentAt: lastSentAt(logs, kind, { contractId: contract.id }),
      subject: draft.subject,
      body: draft.body,
    });
  }

  for (const service of services) {
    if (
      service.status !== "ACTIVE" ||
      !service.next_due_on ||
      (service.maintenance_state !== "DUE_SOON" &&
        service.maintenance_state !== "OVERDUE")
    ) {
      continue;
    }

    const daysLeft = daysBetween(service.next_due_on, today);
    const draft = reminderDraft({
      customerName: service.customer_name,
      appName: service.app_name,
      contactName: null,
      kind: "MAINTENANCE",
      dueOn: service.next_due_on,
      daysLeft,
      itemLabel: service.service_name,
    });

    items.push({
      key: `MAINTENANCE:${service.id}:${service.next_due_on}`,
      kind: "MAINTENANCE",
      customerId: service.customer_id,
      customerName: service.customer_name,
      appName: service.app_name,
      contactEmail: service.contact_email,
      itemKind: "service",
      itemId: service.id,
      itemLabel: service.service_name,
      dueOn: service.next_due_on,
      daysLeft,
      lastSentAt: lastSentAt(logs, "MAINTENANCE", { serviceId: service.id }),
      subject: draft.subject,
      body: draft.body,
    });
  }

  for (const service of services) {
    if (service.status !== "ACTIVE" || service.warranty_state !== "EXPIRING") {
      continue;
    }

    const daysLeft = daysBetween(service.warranty_end_on, today);
    const draft = reminderDraft({
      customerName: service.customer_name,
      appName: service.app_name,
      contactName: null,
      kind: "EXPIRY",
      dueOn: service.warranty_end_on,
      daysLeft,
      itemLabel: service.service_name,
    });

    items.push({
      key: `EXPIRY:${service.id}:${service.warranty_end_on}`,
      kind: "EXPIRY",
      customerId: service.customer_id,
      customerName: service.customer_name,
      appName: service.app_name,
      contactEmail: service.contact_email,
      itemKind: "service",
      itemId: service.id,
      itemLabel: service.service_name,
      dueOn: service.warranty_end_on,
      daysLeft,
      lastSentAt: lastSentAt(logs, "EXPIRY", { serviceId: service.id }),
      subject: draft.subject,
      body: draft.body,
    });
  }

  return items.sort(
    (a, b) =>
      a.dueOn.localeCompare(b.dueOn) ||
      a.customerName.localeCompare(b.customerName) ||
      a.key.localeCompare(b.key),
  );
}

