import type { Notification } from "@/lib/domain/entities/Notification";

/**
 * The notification vocabulary (SCRUM-70/71/72).
 *
 * The `type` a notification carries is a machine code written by a database trigger
 * (`supabase/sql/SCRUM-70_notifications_fanout.sql` and the two scripts after it), and the copy of
 * the message lives with the trigger that emits it. This file is the one place the *screen* learns
 * what those codes mean: their Vietnamese label, the group a user may filter by, and where the row
 * links to.
 *
 * It mirrors `REQUEST_TYPES` in the way the repository mirrors `requests_request_type_check`: the
 * list is duplicated on purpose, because a trigger cannot import TypeScript and the app must not
 * guess. Adding a type means adding it here *and* in the script that emits it — a code this file
 * does not know still renders (with its raw text and a neutral icon), so a database that is one
 * script ahead never breaks the inbox.
 */
export const NOTIFICATION_CATEGORIES = [
  "revenue",
  "requests",
  "schedule",
  "attendance",
  "staff",
  "branch",
  "facility",
  "organization",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const CATEGORY_LABELS: Readonly<Record<NotificationCategory, string>> = {
  revenue: "Doanh thu",
  requests: "Đơn từ",
  schedule: "Lịch làm việc",
  attendance: "Chấm công",
  staff: "Nhân sự",
  branch: "Chi nhánh",
  facility: "Thiết bị",
  organization: "Tổ chức",
};

export interface NotificationTypeMeta {
  /** The Vietnamese headline, matching the `title` the trigger stores. */
  label: string;
  category: NotificationCategory;
}

export const NOTIFICATION_TYPES: Readonly<Record<string, NotificationTypeMeta>> = {
  // ── Doanh thu (SCRUM-71) ─────────────────────────────────────────────────────────────────
  REVENUE_OPENED: { label: "Khai báo doanh thu đầu ca", category: "revenue" },
  REVENUE_CLOSED: { label: "Chốt doanh thu cuối ca", category: "revenue" },
  REVENUE_DIFF: { label: "Doanh thu cuối ca bị lệch", category: "revenue" },

  // ── Đơn từ ───────────────────────────────────────────────────────────────────────────────
  REQUEST_CREATED: { label: "Đơn từ mới cần duyệt", category: "requests" },
  REQUEST_APPROVED: { label: "Đơn của bạn đã được duyệt", category: "requests" },
  REQUEST_REJECTED: { label: "Đơn của bạn bị từ chối", category: "requests" },
  REQUEST_REVIEWED: { label: "Quản lý đã xử lý đơn từ", category: "requests" },

  // ── Lịch làm việc ────────────────────────────────────────────────────────────────────────
  SHIFT_ASSIGNED: { label: "Bạn được xếp ca làm việc", category: "schedule" },
  SHIFT_CHANGED: { label: "Ca làm việc của bạn đã thay đổi", category: "schedule" },
  SHIFT_REMOVED: { label: "Ca làm việc đã bị huỷ", category: "schedule" },
  SHIFT_LEAVE: { label: "Ngày nghỉ", category: "schedule" },

  // ── Chấm công ────────────────────────────────────────────────────────────────────────────
  ATTENDANCE_LATE: { label: "Nhân viên đi muộn", category: "attendance" },
  ATTENDANCE_OUTSIDE: { label: "Chấm công ngoài vùng cho phép", category: "attendance" },
  ATTENDANCE_EARLY_LEAVE: { label: "Nhân viên về sớm", category: "attendance" },
  ATTENDANCE_RESUMED: { label: "Nhân viên vào ca lại", category: "attendance" },
  ATTENDANCE_CORRECTED: { label: "Giờ công của bạn đã được sửa", category: "attendance" },
  ATTENDANCE_VERIFIED: { label: "Bảng công đã được xác nhận", category: "attendance" },
  ATTENDANCE_COMPLAINT: { label: "Khiếu nại bảng công", category: "attendance" },
  COMPLAINT_RESOLVED: { label: "Khiếu nại đã được xử lý", category: "attendance" },

  // ── Nhân sự ──────────────────────────────────────────────────────────────────────────────
  ACCOUNT_CREATED: { label: "Tài khoản của bạn đã được tạo", category: "staff" },
  ACCOUNT_PASSWORD_RESET: { label: "Mật khẩu của bạn đã được đặt lại", category: "staff" },
  STAFF_ROLE_CHANGED: { label: "Vai trò của bạn đã thay đổi", category: "staff" },
  STAFF_OFFBOARDED: { label: "Nhân sự đã nghỉ", category: "staff" },
  STAFF_BRANCH_CHANGED: { label: "Chi nhánh làm việc đã thay đổi", category: "staff" },

  // ── Chi nhánh ────────────────────────────────────────────────────────────────────────────
  BRANCH_CREATED: { label: "Chi nhánh mới", category: "branch" },
  BRANCH_UPDATED: { label: "Chi nhánh đã được cập nhật", category: "branch" },
  BRANCH_DELETED: { label: "Chi nhánh đã được xoá", category: "branch" },
  BRANCH_MANAGER_ASSIGNED: { label: "Bạn được giao phụ trách chi nhánh", category: "branch" },

  // ── Thiết bị ─────────────────────────────────────────────────────────────────────────────
  FACILITY_CREATED: { label: "Thiết bị mới", category: "facility" },
  FACILITY_UPDATED: { label: "Thiết bị đã được cập nhật", category: "facility" },
  FACILITY_DELETED: { label: "Thiết bị đã được xoá", category: "facility" },
  FACILITY_MOVED: { label: "Thiết bị được chuyển chi nhánh", category: "facility" },
  FACILITY_CATEGORY_CREATED: { label: "Nhóm thiết bị mới", category: "facility" },

  // ── Tổ chức ──────────────────────────────────────────────────────────────────────────────
  ORGANIZATION_MEMBER_JOINED: { label: "Thành viên mới gia nhập", category: "organization" },
  ORGANIZATION_INVITED: { label: "Bạn được mời vào tổ chức", category: "organization" },
  ORGANIZATION_UPDATED: { label: "Tổ chức đã được cập nhật", category: "organization" },

  // Rows written before SCRUM-70 (the three codes the old screen knew). Kept so an inbox that
  // already carries one still renders a label instead of the raw code.
  REQUEST: { label: "Đơn từ", category: "requests" },
  REVENUE: { label: "Doanh thu", category: "revenue" },
  ATTENDANCE: { label: "Chấm công", category: "attendance" },
};

/** Every code this app knows — the list `GET /api/notifications?type=…` is validated against. */
export const NOTIFICATION_TYPE_CODES: readonly string[] = Object.keys(
  NOTIFICATION_TYPES,
);

export function isNotificationType(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_TYPES, code);
}

/** The label of a code; an unknown one falls back to the code itself (never to a blank cell). */
export function notificationTypeLabel(type: string): string {
  return NOTIFICATION_TYPES[type]?.label ?? type;
}

export function notificationCategory(type: string): NotificationCategory | null {
  return NOTIFICATION_TYPES[type]?.category ?? null;
}

/** The codes a category chip filters on, for `GET /api/notifications?type=a,b,c`. */
export function notificationTypesOfCategory(
  category: NotificationCategory,
): string[] {
  return NOTIFICATION_TYPE_CODES.filter(
    (code) => NOTIFICATION_TYPES[code].category === category,
  );
}

/**
 * Which screen a notification opens. The entity the trigger stored comes first
 * (`related_entity_type`), so a "ca làm việc đã đổi" row lands on the schedule rather than on the
 * inbox root, and a menu of candidates is given where a role decides the answer: an `EMPLOYEE` may
 * not open `/attendance` (SCRUM-68), so their own timesheet notifications open `/check-in`.
 *
 * `canOpen` is `canAccessScreen(role, path)` from `lib/accessPolicy.ts` — the same table `proxy.ts`
 * and the sidebar read, so the link and the navigation can never disagree.
 */
const ENTITY_SCREENS: Readonly<Record<string, readonly string[]>> = {
  revenue: ["/revenue"],
  request: ["/requests"],
  shift_assignment: ["/schedules"],
  attendance: ["/attendance", "/check-in"],
  user: ["/staff"],
  branch: ["/branches"],
  facility: ["/facilities"],
  facility_category: ["/facilities"],
  organization: ["/organization"],
};

export function notificationHref(
  notification: Pick<Notification, "type" | "related_entity_type">,
  canOpen: (path: string) => boolean,
): string | null {
  const candidates = [
    ...(ENTITY_SCREENS[notification.related_entity_type ?? ""] ?? []),
    // The category's own fallbacks, for a row whose entity has no screen (a login-free account
    // notice) — the category is a better hint than nothing.
    ...(notificationCategory(notification.type) === "attendance"
      ? ["/check-in"]
      : []),
  ];

  for (const path of candidates) {
    if (canOpen(path)) {
      return path;
    }
  }

  return null;
}
