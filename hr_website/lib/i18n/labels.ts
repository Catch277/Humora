import type { AttendanceStatus } from "@/lib/domain/entities/Attendance";
import type { EmployeeStatusValue } from "@/lib/domain/entities/EmployeeStatus";
import type { RequestType } from "@/lib/domain/entities/RequestEntity";
import type { ShiftAssignmentStatus } from "@/lib/domain/entities/Shift";
import type { AttendanceExceptionKind } from "@/lib/usecases/attendanceExceptions";
import type {
  BillingCycle,
  ContractEffectiveStatus,
  ContractPlan,
} from "@/lib/domain/entities/CustomerContract";
import type { CustomerStatus } from "@/lib/domain/entities/Customer";
import type { LeadStatus } from "@/lib/domain/entities/CustomerLead";
import type { EmailDirection } from "@/lib/domain/entities/CustomerEmail";
import type {
  CustomerServiceStatus,
  MaintenanceState,
  WarrantyState,
} from "@/lib/domain/entities/CustomerService";
import type {
  MaintenanceVisitKind,
  MaintenanceVisitState,
} from "@/lib/domain/entities/MaintenanceVisit";
import type {
  ReminderChannel,
  ReminderKind,
} from "@/lib/domain/entities/CustomerReminder";
import type { MessageKey, Translate } from "@/lib/i18n/translate";
import { translateVi } from "@/lib/i18n/translate";

/**
 * The dictionary keys of the fixed vocabularies whose *stored value* is a machine code
 * (`attendance.status`, `shift_assignments.status`, `requests.status`) or a stored label
 * (`requests.request_type`, whose value is the Vietnamese text the queue already displays — see
 * `REQUEST_TYPES`).
 *
 * One place, so a screen never keeps its own `STATUS_LABELS`: the same `Đi muộn` was spelled in
 * `/attendance`, `/check-in` and the dashboard before this file existed. The copy itself lives in
 * `messages/*`, which is why these maps hold keys and not strings.
 *
 * Every label function takes the translator as its **last, optional** argument, exactly like the
 * helpers on a migrated screen: a call site inside a component passes `t` from `useLocale()`, while
 * one outside the provider (or on a screen that has not been migrated yet) keeps the Vietnamese
 * wording from the dictionary's source locale. Nothing renders differently until it opts in.
 */
export const ATTENDANCE_STATUS_KEYS: Record<AttendanceStatus, MessageKey> = {
  ON_TIME: "attendanceStatus.onTime",
  LATE: "attendanceStatus.late",
  EARLY_LEAVE: "attendanceStatus.earlyLeave",
  ABSENT: "attendanceStatus.absent",
  INCOMPLETE: "attendanceStatus.incomplete",
};

export const SHIFT_ASSIGNMENT_STATUS_KEYS: Record<ShiftAssignmentStatus, MessageKey> = {
  SCHEDULED: "shiftStatus.scheduled",
  LEAVE: "shiftStatus.leave",
  CANCELLED: "shiftStatus.cancelled",
};

export const EMPLOYEE_STATUS_KEYS: Record<EmployeeStatusValue, MessageKey> = {
  WORKING: "employeeStatus.working",
  NOT_STARTED: "employeeStatus.notStarted",
  ON_LEAVE: "employeeStatus.onLeave",
  FINISHED: "employeeStatus.finished",
  NO_SHIFT: "employeeStatus.noShift",
  RESIGNED: "employeeStatus.resigned",
};

/** `requests.status` is a plain `string` on the entity, so this one is keyed by string. */
export const REQUEST_STATUS_KEYS: Record<string, MessageKey> = {
  PENDING: "requestStatus.pending",
  APPROVED: "requestStatus.approved",
  REJECTED: "requestStatus.rejected",
};

/**
 * Keyed by the stored value, not by an enum: `requests.request_type` *is* the displayed label, and the
 * value is both written and filtered on (SCRUM-62 keeps it in step with `requests_request_type_check`).
 * Translating the display therefore must never change what is sent — a screen renders
 * `requestTypeLabel(value, t)` next to a payload that still carries `value`.
 */
export const REQUEST_TYPE_KEYS: Record<RequestType, MessageKey> = {
  "Nghỉ phép": "requestType.leave",
  "Đổi ca": "requestType.shiftChange",
  "Điều chỉnh công": "requestType.hoursAdjustment",
  Khác: "requestType.other",
};

/**
 * Render a code through a vocabulary: its dictionary key when the vocabulary knows the code, the raw code
 * otherwise — a value the database returns that the union does not list (a legacy row) has to render
 * itself, never a blank pill.
 *
 * The parameter is a string-keyed map because `code` is a column value, while the vocabularies above are
 * `Record<union, key>`: that annotation is exactly what makes a value added to the entity without a key
 * below a typecheck failure, and TypeScript refuses to index such a record with a bare `string`.
 */
function labelOf(
  keys: Readonly<Record<string, MessageKey>>,
  code: string,
  t: Translate,
): string {
  const key = keys[code];

  return key ? t(key) : code;
}

export function attendanceStatusLabel(
  status: AttendanceStatus,
  t: Translate = translateVi,
): string {
  return labelOf(ATTENDANCE_STATUS_KEYS, status, t);
}

/**
 * The exception vocabulary of the A4 timesheet (SCRUM-96): what a row can be wrong about, derived by
 * `lib/usecases/attendanceExceptions.ts`. Keyed by the derived kind, so a kind added to the engine
 * without a label is a typecheck failure — and a kind the dictionary does not know still renders its
 * code instead of a blank chip (`labelOf`).
 */
export const ATTENDANCE_EXCEPTION_KEYS: Record<
  AttendanceExceptionKind,
  MessageKey
> = {
  LATE: "attendanceException.late",
  EARLY_LEAVE: "attendanceException.earlyLeave",
  MISSING_CHECKOUT: "attendanceException.missingCheckout",
  OUTSIDE_GEOFENCE: "attendanceException.outsideGeofence",
  NO_LOCATION: "attendanceException.noLocation",
  NO_SCHEDULE: "attendanceException.noSchedule",
  SHIFT_MISMATCH: "attendanceException.shiftMismatch",
  BRANCH_MISMATCH: "attendanceException.branchMismatch",
  REOPENED: "attendanceException.reopened",
  SYNC_DELAY: "attendanceException.syncDelay",
  OPEN_COMPLAINT: "attendanceException.openComplaint",
};

export function attendanceExceptionLabel(
  kind: AttendanceExceptionKind,
  t: Translate = translateVi,
): string {
  return labelOf(ATTENDANCE_EXCEPTION_KEYS, kind, t);
}

export function shiftAssignmentStatusLabel(
  status: ShiftAssignmentStatus,
  t: Translate = translateVi,
): string {
  return labelOf(SHIFT_ASSIGNMENT_STATUS_KEYS, status, t);
}

export function employeeStatusLabel(
  status: EmployeeStatusValue,
  t: Translate = translateVi,
): string {
  return labelOf(EMPLOYEE_STATUS_KEYS, status, t);
}

export function requestStatusLabel(status: string, t: Translate = translateVi): string {
  return labelOf(REQUEST_STATUS_KEYS, status, t);
}

/** See `REQUEST_TYPE_KEYS`: the argument is the stored value, which is also what the API receives. */
export function requestTypeLabel(value: string, t: Translate = translateVi): string {
  return labelOf(REQUEST_TYPE_KEYS, value, t);
}

/**
 * The verdict of the geofence check (SCRUM-22), as `/check-in` and `/attendance` both render it.
 *
 * Keyed by the same three codes the two screens derive, and typed as a plain string because the code
 * travels through the API: an unknown one renders itself.
 */
const GEOFENCE_KEYS: Record<string, MessageKey> = {
  INSIDE: "geofence.inside",
  OUTSIDE: "geofence.outside",
  UNKNOWN: "geofence.unknown",
};

export function geofenceLabel(verdict: string, t: Translate = translateVi): string {
  return labelOf(GEOFENCE_KEYS, verdict, t);
}

/**
 * The CRM vocabularies (SCRUM-101/102). Keyed by the stored code, exactly like the timesheet maps above:
 * a code the dictionary does not know renders itself rather than a blank chip, and a value added to an
 * entity without a label is a typecheck failure.
 */
export const CUSTOMER_STATUS_KEYS: Record<CustomerStatus, MessageKey> = {
  PROSPECT: "customerStatus.PROSPECT",
  ACTIVE: "customerStatus.ACTIVE",
  SUSPENDED: "customerStatus.SUSPENDED",
  CHURNED: "customerStatus.CHURNED",
};

export const LEAD_STATUS_KEYS: Record<LeadStatus, MessageKey> = {
  NEW: "leadStatus.NEW",
  CONTACTED: "leadStatus.CONTACTED",
  DEMO_SCHEDULED: "leadStatus.DEMO_SCHEDULED",
  CONVERTED: "leadStatus.CONVERTED",
  REJECTED: "leadStatus.REJECTED",
};

export const CONTRACT_STATUS_KEYS: Record<
  ContractEffectiveStatus,
  MessageKey
> = {
  DRAFT: "contractStatus.DRAFT",
  ACTIVE: "contractStatus.ACTIVE",
  EXPIRING: "contractStatus.EXPIRING",
  EXPIRED: "contractStatus.EXPIRED",
  TERMINATED: "contractStatus.TERMINATED",
};

export const CONTRACT_PLAN_KEYS: Record<ContractPlan, MessageKey> = {
  BASIC: "contractPlan.BASIC",
  ADVANCED: "contractPlan.ADVANCED",
  PREMIUM: "contractPlan.PREMIUM",
};

export const BILLING_CYCLE_KEYS: Record<BillingCycle, MessageKey> = {
  MONTHLY: "billingCycle.MONTHLY",
  QUARTERLY: "billingCycle.QUARTERLY",
  YEARLY: "billingCycle.YEARLY",
};

export const EMAIL_DIRECTION_KEYS: Record<EmailDirection, MessageKey> = {
  INBOUND: "emailDirection.INBOUND",
  OUTBOUND: "emailDirection.OUTBOUND",
  NOTE: "emailDirection.NOTE",
};

export const SERVICE_STATUS_KEYS: Record<CustomerServiceStatus, MessageKey> = {
  ACTIVE: "serviceStatus.ACTIVE",
  ENDED: "serviceStatus.ENDED",
};

export const WARRANTY_STATE_KEYS: Record<WarrantyState, MessageKey> = {
  NONE: "warrantyState.NONE",
  IN_WARRANTY: "warrantyState.IN_WARRANTY",
  EXPIRING: "warrantyState.EXPIRING",
  EXPIRED: "warrantyState.EXPIRED",
};

export const MAINTENANCE_STATE_KEYS: Record<MaintenanceState, MessageKey> = {
  NONE: "maintenanceState.NONE",
  OK: "maintenanceState.OK",
  DUE_SOON: "maintenanceState.DUE_SOON",
  OVERDUE: "maintenanceState.OVERDUE",
};

export const VISIT_STATE_KEYS: Record<MaintenanceVisitState, MessageKey> = {
  PLANNED: "visitState.PLANNED",
  OVERDUE: "visitState.OVERDUE",
  DONE: "visitState.DONE",
};

export const VISIT_KIND_KEYS: Record<MaintenanceVisitKind, MessageKey> = {
  MAINTENANCE: "visitKind.MAINTENANCE",
  REPAIR: "visitKind.REPAIR",
  SUPPORT: "visitKind.SUPPORT",
  TRAINING: "visitKind.TRAINING",
};

export const REMINDER_KIND_KEYS: Record<ReminderKind, MessageKey> = {
  RENEWAL: "reminderKind.RENEWAL",
  EXPIRY: "reminderKind.EXPIRY",
  MAINTENANCE: "reminderKind.MAINTENANCE",
  USAGE: "reminderKind.USAGE",
  OTHER: "reminderKind.OTHER",
};

export const REMINDER_CHANNEL_KEYS: Record<ReminderChannel, MessageKey> = {
  EMAIL: "reminderChannel.EMAIL",
  PHONE: "reminderChannel.PHONE",
  MEETING: "reminderChannel.MEETING",
  IN_PERSON: "reminderChannel.IN_PERSON",
};

export function customerStatusLabel(
  status: CustomerStatus,
  t: Translate = translateVi,
): string {
  return labelOf(CUSTOMER_STATUS_KEYS, status, t);
}

export function leadStatusLabel(
  status: LeadStatus,
  t: Translate = translateVi,
): string {
  return labelOf(LEAD_STATUS_KEYS, status, t);
}

export function contractStatusLabel(
  status: ContractEffectiveStatus,
  t: Translate = translateVi,
): string {
  return labelOf(CONTRACT_STATUS_KEYS, status, t);
}

export function contractPlanLabel(
  plan: ContractPlan,
  t: Translate = translateVi,
): string {
  return labelOf(CONTRACT_PLAN_KEYS, plan, t);
}

export function billingCycleLabel(
  cycle: BillingCycle,
  t: Translate = translateVi,
): string {
  return labelOf(BILLING_CYCLE_KEYS, cycle, t);
}

export function emailDirectionLabel(
  direction: EmailDirection,
  t: Translate = translateVi,
): string {
  return labelOf(EMAIL_DIRECTION_KEYS, direction, t);
}

export function serviceStatusLabel(
  status: CustomerServiceStatus,
  t: Translate = translateVi,
): string {
  return labelOf(SERVICE_STATUS_KEYS, status, t);
}

export function warrantyStateLabel(
  state: WarrantyState,
  t: Translate = translateVi,
): string {
  return labelOf(WARRANTY_STATE_KEYS, state, t);
}

export function maintenanceStateLabel(
  state: MaintenanceState,
  t: Translate = translateVi,
): string {
  return labelOf(MAINTENANCE_STATE_KEYS, state, t);
}

export function maintenanceVisitStateLabel(
  state: MaintenanceVisitState,
  t: Translate = translateVi,
): string {
  return labelOf(VISIT_STATE_KEYS, state, t);
}

export function maintenanceVisitKindLabel(
  kind: MaintenanceVisitKind,
  t: Translate = translateVi,
): string {
  return labelOf(VISIT_KIND_KEYS, kind, t);
}

export function reminderKindLabel(
  kind: ReminderKind,
  t: Translate = translateVi,
): string {
  return labelOf(REMINDER_KIND_KEYS, kind, t);
}

export function reminderChannelLabel(
  channel: ReminderChannel,
  t: Translate = translateVi,
): string {
  return labelOf(REMINDER_CHANNEL_KEYS, channel, t);
}
