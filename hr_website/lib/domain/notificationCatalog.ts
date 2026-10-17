import type { Notification } from "@/lib/domain/entities/Notification";
import { translateVi, type MessageKey, type Translate } from "@/lib/i18n/translate";

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

export const CATEGORY_KEYS: Readonly<Record<NotificationCategory, MessageKey>> = {
  revenue: "notificationCategory.revenue",
  requests: "notificationCategory.requests",
  schedule: "notificationCategory.schedule",
  attendance: "notificationCategory.attendance",
  staff: "notificationCategory.staff",
  branch: "notificationCategory.branch",
  facility: "notificationCategory.facility",
  organization: "notificationCategory.organization",
};

/**
 * The Vietnamese label of each group, read from the dictionary's source locale.
 *
 * It stays a value because `/notifications` renders it directly and that screen has its own migration
 * pass; nothing is duplicated by keeping it, since the copy *is* the `vi` entry of the key — the two can
 * no longer drift the way a second hand-written table would.
 */
export const CATEGORY_LABELS: Readonly<Record<NotificationCategory, string>> = {
  revenue: translateVi(CATEGORY_KEYS.revenue),
  requests: translateVi(CATEGORY_KEYS.requests),
  schedule: translateVi(CATEGORY_KEYS.schedule),
  attendance: translateVi(CATEGORY_KEYS.attendance),
  staff: translateVi(CATEGORY_KEYS.staff),
  branch: translateVi(CATEGORY_KEYS.branch),
  facility: translateVi(CATEGORY_KEYS.facility),
  organization: translateVi(CATEGORY_KEYS.organization),
};

export interface NotificationTypeMeta {
  /**
   * The dictionary key of the label. The Vietnamese headline the trigger stores as `title` is the `vi`
   * entry of that key (see `lib/i18n/labels.ts` for why the vocabulary holds keys and not strings).
   */
  key: MessageKey;
  category: NotificationCategory;
}

export const NOTIFICATION_TYPES: Readonly<Record<string, NotificationTypeMeta>> = {
  // ── Doanh thu (SCRUM-71) ─────────────────────────────────────────────────────────────────
  REVENUE_OPENED: { key: "notificationType.revenueOpened", category: "revenue" },
  REVENUE_CLOSED: { key: "notificationType.revenueClosed", category: "revenue" },
  REVENUE_DIFF: { key: "notificationType.revenueDiff", category: "revenue" },

  // ── Đơn từ ───────────────────────────────────────────────────────────────────────────────
  REQUEST_CREATED: { key: "notificationType.requestCreated", category: "requests" },
  REQUEST_APPROVED: { key: "notificationType.requestApproved", category: "requests" },
  REQUEST_REJECTED: { key: "notificationType.requestRejected", category: "requests" },
  REQUEST_REVIEWED: { key: "notificationType.requestReviewed", category: "requests" },

  // ── Lịch làm việc ────────────────────────────────────────────────────────────────────────
  SHIFT_ASSIGNED: { key: "notificationType.shiftAssigned", category: "schedule" },
  SHIFT_CHANGED: { key: "notificationType.shiftChanged", category: "schedule" },
  SHIFT_REMOVED: { key: "notificationType.shiftRemoved", category: "schedule" },
  SHIFT_LEAVE: { key: "notificationType.shiftLeave", category: "schedule" },

  // ── Chấm công ────────────────────────────────────────────────────────────────────────────
  ATTENDANCE_LATE: { key: "notificationType.attendanceLate", category: "attendance" },
  ATTENDANCE_OUTSIDE: { key: "notificationType.attendanceOutside", category: "attendance" },
  ATTENDANCE_EARLY_LEAVE: { key: "notificationType.attendanceEarlyLeave", category: "attendance" },
  ATTENDANCE_RESUMED: { key: "notificationType.attendanceResumed", category: "attendance" },
  ATTENDANCE_CORRECTED: { key: "notificationType.attendanceCorrected", category: "attendance" },
  ATTENDANCE_VERIFIED: { key: "notificationType.attendanceVerified", category: "attendance" },
  ATTENDANCE_COMPLAINT: { key: "notificationType.attendanceComplaint", category: "attendance" },
  COMPLAINT_RESOLVED: { key: "notificationType.complaintResolved", category: "attendance" },

  // ── Nhân sự ──────────────────────────────────────────────────────────────────────────────
  ACCOUNT_CREATED: { key: "notificationType.accountCreated", category: "staff" },
  ACCOUNT_PASSWORD_RESET: { key: "notificationType.accountPasswordReset", category: "staff" },
  STAFF_ROLE_CHANGED: { key: "notificationType.staffRoleChanged", category: "staff" },
  STAFF_OFFBOARDED: { key: "notificationType.staffOffboarded", category: "staff" },
  STAFF_BRANCH_CHANGED: { key: "notificationType.staffBranchChanged", category: "staff" },

  // ── Chi nhánh ────────────────────────────────────────────────────────────────────────────
  BRANCH_CREATED: { key: "notificationType.branchCreated", category: "branch" },
  BRANCH_UPDATED: { key: "notificationType.branchUpdated", category: "branch" },
  BRANCH_DELETED: { key: "notificationType.branchDeleted", category: "branch" },
  BRANCH_MANAGER_ASSIGNED: {
    key: "notificationType.branchManagerAssigned",
    category: "branch",
  },

  // ── Thiết bị ─────────────────────────────────────────────────────────────────────────────
  FACILITY_CREATED: { key: "notificationType.facilityCreated", category: "facility" },
  FACILITY_UPDATED: { key: "notificationType.facilityUpdated", category: "facility" },
  FACILITY_DELETED: { key: "notificationType.facilityDeleted", category: "facility" },
  FACILITY_MOVED: { key: "notificationType.facilityMoved", category: "facility" },
  FACILITY_CATEGORY_CREATED: { key: "notificationType.facilityCategoryCreated", category: "facility" },

  // ── Tổ chức ──────────────────────────────────────────────────────────────────────────────
  ORGANIZATION_MEMBER_JOINED: {
    key: "notificationType.organizationMemberJoined",
    category: "organization",
  },
  ORGANIZATION_INVITED: { key: "notificationType.organizationInvited", category: "organization" },
  ORGANIZATION_UPDATED: { key: "notificationType.organizationUpdated", category: "organization" },

  // Rows written before SCRUM-70 (the three codes the old screen knew). Kept so an inbox that
  // already carries one still renders a label instead of the raw code.
  REQUEST: { key: "notificationType.legacyRequest", category: "requests" },
  REVENUE: { key: "notificationType.legacyRevenue", category: "revenue" },
  ATTENDANCE: { key: "notificationType.legacyAttendance", category: "attendance" },
};

/** Every code this app knows — the list `GET /api/notifications?type=…` is validated against. */
export const NOTIFICATION_TYPE_CODES: readonly string[] = Object.keys(
  NOTIFICATION_TYPES,
);

export function isNotificationType(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_TYPES, code);
}

/**
 * The label of a code; an unknown one falls back to the code itself (never to a blank cell).
 *
 * `t` is optional and last, like every shared label helper: a screen passes `useLocale().t`, a caller
 * outside the provider — or a screen not yet migrated — keeps the Vietnamese wording.
 */
export function notificationTypeLabel(type: string, t: Translate = translateVi): string {
  const entry = NOTIFICATION_TYPES[type];

  return entry ? t(entry.key) : type;
}

/** The label of a group, for the filter chips and the "mark this group as read" button. */
export function notificationCategoryLabel(
  category: NotificationCategory,
  t: Translate = translateVi,
): string {
  return t(CATEGORY_KEYS[category]);
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
