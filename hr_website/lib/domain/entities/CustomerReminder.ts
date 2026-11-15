/**
 * Nhật ký nhắc khách (SCRUM-102, C5) và hàng đợi suy ra từ nó.
 *
 * `CustomerReminderLog` là **thứ đã gửi** (`kind`, `due_on`, `channel`, `sent_at`). Danh sách "việc cần
 * làm" không nằm trong CSDL: `lib/usecases/reminderQueue.ts` suy ra nó từ hợp đồng sắp hết hạn và dịch vụ
 * tới kỳ bảo trì, rồi ghép với log gần nhất. Nhờ vậy không có bảng nào phải được một cron làm mới, và
 * "chưa nhắc" đơn giản là "chưa có dòng nào".
 */
export const REMINDER_KINDS = [
  "RENEWAL",
  "EXPIRY",
  "MAINTENANCE",
  "USAGE",
  "OTHER",
] as const;

export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const REMINDER_CHANNELS = ["EMAIL", "PHONE", "MEETING", "IN_PERSON"] as const;

export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

export interface CustomerReminderLog {
  id: string;
  organization_id: string;
  customer_id: string;
  contract_id: string | null;
  service_id: string | null;
  kind: ReminderKind;
  due_on: string;
  channel: ReminderChannel;
  subject: string | null;
  body: string | null;
  sent_at: string;
  note: string | null;
}

export const CUSTOMER_REMINDER_LIMITS = {
  subject: 200,
  body: 8000,
  note: 500,
} as const;

export interface LogReminderInput {
  customerId: string;
  contractId: string | null;
  serviceId: string | null;
  kind: ReminderKind;
  dueOn: string;
  channel: ReminderChannel;
  subject: string | null;
  body: string | null;
  note: string | null;
}

/**
 * Một việc cần nhắc, dựng bởi `buildReminderQueue()`. `key` là thứ React dùng để giữ chỗ giữa hai lần tải;
 * `itemId` (hợp đồng hoặc dịch vụ) là thứ widget gửi lại khi ghi nhận đã nhắc.
 */
export interface ReminderItem {
  key: string;
  kind: ReminderKind;
  customerId: string;
  customerName: string;
  appName: string;
  contactEmail: string;
  /** Which table `itemId` belongs to — the log needs exactly one of the two foreign keys. */
  itemKind: "contract" | "service";
  itemId: string;
  itemLabel: string;
  dueOn: string;
  /** Negative when the date has passed. */
  daysLeft: number;
  lastSentAt: string | null;
  subject: string;
  body: string;
}

export function isReminderKind(value: unknown): value is ReminderKind {
  return (
    typeof value === "string" &&
    (REMINDER_KINDS as readonly string[]).includes(value)
  );
}

export function isReminderChannel(value: unknown): value is ReminderChannel {
  return (
    typeof value === "string" &&
    (REMINDER_CHANNELS as readonly string[]).includes(value)
  );
}
