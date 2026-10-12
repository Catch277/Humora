import type { AttendanceStatus } from "@/lib/domain/entities/Attendance";
import type { EmployeeStatusValue } from "@/lib/domain/entities/EmployeeStatus";
import type { RequestType } from "@/lib/domain/entities/RequestEntity";
import type { ShiftAssignmentStatus } from "@/lib/domain/entities/Shift";
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
