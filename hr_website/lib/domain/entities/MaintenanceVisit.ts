/**
 * Một lần bảo trì / sửa chữa / hỗ trợ của một dịch vụ (SCRUM-102, C5).
 *
 * Trạng thái **không** được lưu. `DONE` là "có `completed_on`", `OVERDUE` là "chưa xong mà ngày hẹn đã
 * qua", `PLANNED` là phần còn lại — cùng lý do `attendanceExceptions` suy ra verdict thay vì lưu nó: một
 * cột `OVERDUE` sẽ đúng vào hôm được ghi và sai vào mọi hôm sau.
 *
 * Một lần đã xong bắt buộc có `summary`: dòng này là lịch sử dịch vụ của khách, và "xong" mà không nói đã
 * làm gì thì không phân biệt được với một ngày gõ nhầm.
 */
export const MAINTENANCE_VISIT_KINDS = [
  "MAINTENANCE",
  "REPAIR",
  "SUPPORT",
  "TRAINING",
] as const;

export type MaintenanceVisitKind = (typeof MAINTENANCE_VISIT_KINDS)[number];

export const MAINTENANCE_VISIT_STATES = ["PLANNED", "OVERDUE", "DONE"] as const;

export type MaintenanceVisitState = (typeof MAINTENANCE_VISIT_STATES)[number];

export interface MaintenanceVisit {
  id: string;
  organization_id: string;
  service_id: string;
  customer_id: string;
  scheduled_on: string;
  completed_on: string | null;
  kind: MaintenanceVisitKind;
  technician: string | null;
  cost: number;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export const MAINTENANCE_VISIT_LIMITS = {
  technician: 120,
  summary: 1000,
  cost: { min: 0, max: 1_000_000_000 },
} as const;

export interface CreateMaintenanceVisitInput {
  serviceId: string;
  customerId: string;
  scheduledOn: string;
  completedOn: string | null;
  kind: MaintenanceVisitKind;
  technician: string | null;
  cost: number;
  summary: string | null;
}

/** What a completion or a reschedule changes. Every field is optional: omitted keeps the stored value. */
export interface UpdateMaintenanceVisitInput {
  id: string;
  scheduledOn?: string;
  completedOn?: string | null;
  kind?: MaintenanceVisitKind;
  technician?: string | null;
  cost?: number;
  summary?: string | null;
}

export interface MaintenanceVisitFilters {
  serviceId?: string;
  customerId?: string;
}

export function isMaintenanceVisitKind(
  value: unknown,
): value is MaintenanceVisitKind {
  return (
    typeof value === "string" &&
    (MAINTENANCE_VISIT_KINDS as readonly string[]).includes(value)
  );
}

/** `DONE` / `OVERDUE` / `PLANNED` for a row, against a `YYYY-MM-DD` business day. */
export function maintenanceVisitState(
  visit: Pick<MaintenanceVisit, "completed_on" | "scheduled_on">,
  today: string,
): MaintenanceVisitState {
  if (visit.completed_on) {
    return "DONE";
  }

  return visit.scheduled_on < today ? "OVERDUE" : "PLANNED";
}
