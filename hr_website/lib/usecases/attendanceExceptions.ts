import type { Attendance } from "@/lib/domain/entities/Attendance";
import type { ShiftAssignment } from "@/lib/domain/entities/Shift";
import {
  effectiveCheckOut,
  shiftEndInstant,
} from "@/lib/usecases/attendanceAutoClose";
import { getBusinessDay } from "@/lib/usecases/businessDay";

/**
 * What a timesheet row can be wrong about (A4 "Automated Timekeeping" — đối chiếu với lịch làm việc).
 *
 * The list is a **vocabulary of derived facts**, not a column: nothing here is stored, so no value can
 * drift from the evidence. `LATE` / `EARLY_LEAVE` are read from the status the clock wrote (that is what
 * payroll sees), `MISSING_CHECKOUT` comes from `attendanceAutoClose` (the ca ended, nobody clocked out),
 * `OUTSIDE_GEOFENCE` / `NO_LOCATION` from the stored point, `SYNC_DELAY` from the gap between the device
 * tap and the row reaching the database, and the schedule comparison (`NO_SCHEDULE`, `SHIFT_MISMATCH`,
 * `BRANCH_MISMATCH`) from the day's `shift_assignments`.
 *
 * A resolved complaint is no longer an exception; an **open** one is, because somebody has to decide it.
 * `NO_SHOW` lives outside this list: it is a *planned* ca with no `attendance` row at all, so there is
 * no record to hang it on — see `findNoShows`.
 */
export const ATTENDANCE_EXCEPTION_KINDS = [
  "LATE",
  "EARLY_LEAVE",
  "MISSING_CHECKOUT",
  "OUTSIDE_GEOFENCE",
  "NO_LOCATION",
  "NO_SCHEDULE",
  "SHIFT_MISMATCH",
  "BRANCH_MISMATCH",
  "REOPENED",
  "SYNC_DELAY",
  "OPEN_COMPLAINT",
] as const;

export type AttendanceExceptionKind =
  (typeof ATTENDANCE_EXCEPTION_KINDS)[number];

export const ATTENDANCE_EXCEPTION_SEVERITIES = ["alert", "notice"] as const;

/**
 * `alert` = somebody must look (an unverifiable or unplanned record); `notice` = a fact the reviewer
 * should read but that needs no decision. The "Cần xử lý" filter counts `alert` only, which is what
 * makes the KPI mean something — counting "chưa xác nhận" (every fresh row) made it the row count.
 */
export type AttendanceExceptionSeverity =
  (typeof ATTENDANCE_EXCEPTION_SEVERITIES)[number];

const SEVERITY: Record<AttendanceExceptionKind, AttendanceExceptionSeverity> = {
  LATE: "notice",
  EARLY_LEAVE: "notice",
  REOPENED: "notice",
  MISSING_CHECKOUT: "alert",
  OUTSIDE_GEOFENCE: "alert",
  NO_LOCATION: "alert",
  NO_SCHEDULE: "alert",
  SHIFT_MISMATCH: "alert",
  BRANCH_MISMATCH: "alert",
  SYNC_DELAY: "alert",
  OPEN_COMPLAINT: "alert",
};

/**
 * How far apart the device's giờ vào and the row's `created_at` may be before the arrival counts as a
 * late sync. The app posts within seconds on a connection; a quarter of an hour is already generous.
 *
 * A late sync is not automatically a problem — an offline ca may legitimately upload hours later —
 * which is exactly why it is surfaced: the reviewer sees that the record arrived after the fact.
 */
export const SYNC_DELAY_MINUTES = 15;

const SYNC_DELAY_MS = SYNC_DELAY_MINUTES * 60 * 1000;

export interface AttendanceException {
  kind: AttendanceExceptionKind;
  severity: AttendanceExceptionSeverity;
}

export type GeofenceVerdict = "INSIDE" | "OUTSIDE" | "UNKNOWN";

/**
 * The geofence verdict of SCRUM-22: a check-in point is valid when it lies within the branch's allowed
 * radius. A missing distance, or a branch without coordinates, cannot be judged.
 *
 * Shared with the screens by living here: `/attendance` renders `geofenceLabel`, the exception engine
 * turns `OUTSIDE` into an alert, and both read this one function.
 */
export function geofenceVerdict(record: Attendance): GeofenceVerdict {
  if (
    record.check_in_distance_m === null ||
    record.branch === null ||
    record.branch.latitude === null ||
    record.branch.longitude === null
  ) {
    return "UNKNOWN";
  }

  return record.check_in_distance_m <= record.branch.attendance_radius
    ? "INSIDE"
    : "OUTSIDE";
}

/** One derived verdict, ready for a chip. */
function exception(kind: AttendanceExceptionKind): AttendanceException {
  return { kind, severity: SEVERITY[kind] };
}

/**
 * Every abnormal thing about one row.
 *
 * `planned` is the schedule of that **employee and day** (any status). Passing an empty array is a
 * legitimate state — the schedule request failed, or the screen is showing a range it did not load —
 * and it only removes the three comparison kinds; nothing about the row itself is guessed.
 */
export function deriveAttendanceExceptions(
  record: Attendance,
  planned: readonly ShiftAssignment[],
  now: Date = new Date(),
): AttendanceException[] {
  const exceptions: AttendanceException[] = [];

  if (record.status === "LATE") {
    exceptions.push(exception("LATE"));
  }

  if (record.status === "EARLY_LEAVE") {
    exceptions.push(exception("EARLY_LEAVE"));
  }

  // "Vào ca lại": `resumed_at` is set by `attendance_track_worked_time` on every re-open and stays
  // afterwards, so this says "the ca was re-opened at least once", not "it is open now".
  if (record.resumed_at !== null) {
    exceptions.push(exception("REOPENED"));
  }

  // Nobody closed the ca and its end has passed (`autoCheckOutAt`): the time is inferred, not clicked.
  if (
    record.check_in_at !== null &&
    effectiveCheckOut(record, record.shift, now).automatic
  ) {
    exceptions.push(exception("MISSING_CHECKOUT"));
  }

  if (geofenceVerdict(record) === "OUTSIDE") {
    exceptions.push(exception("OUTSIDE_GEOFENCE"));
  }

  // No GPS point at all (the device refused one): presence cannot be checked, which is an alert rather
  // than a silent "unknown" badge.
  if (record.check_in_at !== null && record.check_in_latitude === null) {
    exceptions.push(exception("NO_LOCATION"));
  }

  if (record.shift_id === null) {
    // An arrival with no ca: nothing to compare, and the reviewer must decide whether it was work.
    exceptions.push(exception("NO_SCHEDULE"));
  } else {
    const scheduled = planned.filter(
      (assignment) => assignment.status === "SCHEDULED",
    );
    const exact = scheduled.find(
      (assignment) => assignment.shift_id === record.shift_id,
    );

    if (exact) {
      if (exact.branch_id !== record.branch_id) {
        exceptions.push(exception("BRANCH_MISMATCH"));
      }
    } else if (planned.length > 0) {
      // The plan for that day does not contain this ca at all: it was changed, cancelled, or the day
      // is a LEAVE day the employee worked anyway. Either way the plan and the timesheet disagree.
      exceptions.push(exception("SHIFT_MISMATCH"));
    }
  }

  if (record.complaint_status === "OPEN") {
    exceptions.push(exception("OPEN_COMPLAINT"));
  }

  const checkIn = record.check_in_at ? Date.parse(record.check_in_at) : NaN;
  const received = Date.parse(record.created_at);

  if (
    Number.isFinite(checkIn) &&
    Number.isFinite(received) &&
    received - checkIn > SYNC_DELAY_MS
  ) {
    exceptions.push(exception("SYNC_DELAY"));
  }

  return exceptions;
}

/** Whether a row needs a decision, i.e. carries at least one `alert`. */
export function needsAttention(
  exceptions: readonly AttendanceException[],
): boolean {
  return exceptions.some((entry) => entry.severity === "alert");
}

/**
 * The queue's actual question (SCRUM-97): the row carries an alert **and** nobody has closed it yet.
 *
 * The derived facts stay on the row after a resolution on purpose — a late arrival is still late — so
 * "needs action" has to combine the derived verdict with the stored decision. Keeping that combination
 * here (instead of in the screen) is what stops the KPI, the filter and the chip colours from
 * disagreeing about the same row.
 */
export function hasOpenException(
  record: Pick<Attendance, "exception_status">,
  exceptions: readonly AttendanceException[],
): boolean {
  return record.exception_status !== "RESOLVED" && needsAttention(exceptions);
}

/** One key per employee and business day, so a row can find its day's plan without a scan. */
export function groupAssignmentsByEmployeeDay(
  assignments: readonly ShiftAssignment[],
): Map<string, ShiftAssignment[]> {
  const grouped = new Map<string, ShiftAssignment[]>();

  assignments.forEach((assignment) => {
    const key = `${assignment.employee_id}|${assignment.work_date}`;
    const list = grouped.get(key);

    if (list) {
      list.push(assignment);
    } else {
      grouped.set(key, [assignment]);
    }
  });

  return grouped;
}

/**
 * `NO_SHOW` — a ca the plan expected and the timesheet has no row for.
 *
 * Only a `SCHEDULED` assignment whose ca has **already ended** counts: a ca later today is not a
 * no-show yet, and a `LEAVE` row is a day off (SCRUM-83/86). A row without a ca ("Ngoài lịch") covers
 * the day it is on, because it cannot be matched to one template — the reviewer reads it as unplanned
 * work, not as a second absence.
 */
export function findNoShows(
  assignments: readonly ShiftAssignment[],
  records: readonly Attendance[],
  now: Date = new Date(),
): ShiftAssignment[] {
  const workedByShift = new Set<string>();
  const workedWithoutShift = new Set<string>();

  records.forEach((record) => {
    const dayKey = `${record.employee_id}|${record.work_date}`;

    if (record.shift_id) {
      workedByShift.add(`${dayKey}|${record.shift_id}`);
    } else {
      workedWithoutShift.add(dayKey);
    }
  });

  const today = getBusinessDay(now);

  return assignments.filter((assignment) => {
    if (assignment.status !== "SCHEDULED") {
      return false;
    }

    const dayKey = `${assignment.employee_id}|${assignment.work_date}`;

    if (workedByShift.has(`${dayKey}|${assignment.shift_id}`)) {
      return false;
    }

    if (workedWithoutShift.has(dayKey)) {
      return false;
    }

    const end = shiftEndInstant(assignment.work_date, assignment.shift);

    // A template without hours has no instant to judge by, so the day itself is the test.
    return end !== null
      ? end.getTime() <= now.getTime()
      : assignment.work_date < today;
  });
}

