import type { Attendance, AttendanceStatus } from "@/lib/domain/entities/Attendance";

const BUSINESS_TIME_ZONE = "Asia/Bangkok";

/**
 * How late an arrival may be before it reads as Đi muộn (SCRUM-68).
 *
 * The device clock, the network and the walk from the door to the phone are not perfectly aligned, so a
 * minute or two past the ca start is not lateness for payroll. A manager can still correct the record
 * (`PATCH /api/attendance/{id}` records who did it and why), which is where a genuinely contested verdict
 * belongs.
 */
export const CHECK_IN_GRACE_MINUTES = 5;

/**
 * Minutes since midnight in Asia/Bangkok (UTC+7, no DST) for an instant.
 *
 * The comparison has to happen on the business wall clock: `check_in_at` is stored in UTC, while a ca's
 * `start_time` is a local `time`, so subtracting the two as instants would be off by seven hours. This is
 * the same timezone discipline `lib/usecases/businessDay.ts` follows — do not replace it with the server
 * timezone.
 */
function businessMinutesOfDay(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);

  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type === "hour" || type === "minute")
      .map(({ type, value }) => [type, Number(value)]),
  ) as { hour?: number; minute?: number };

  return (values.hour ?? 0) * 60 + (values.minute ?? 0);
}

/**
 * `shifts.start_time` / `end_time` as minutes since midnight. PostgREST serves a `time` column as
 * `HH:MM:SS`; a template without hours (both columns are nullable) answers `null`, and so does anything
 * unparsable — a ca without hours cannot judge punctuality, it is not an error.
 */
export function parseTimeOfDay(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

/**
 * The status a check-in is stored with: `LATE` when the arrival is more than the grace past the ca start,
 * `ON_TIME` otherwise. A ca without a start time (or an unscheduled check-in, whose ca is unknown) is
 * `ON_TIME` — there is nothing to be late against, and the manager reviews the row anyway.
 */
export function resolveCheckInStatus(
  at: Date,
  shiftStartTime: string | null,
): AttendanceStatus {
  const startMinutes = parseTimeOfDay(shiftStartTime);

  if (startMinutes === null) {
    return "ON_TIME";
  }

  return businessMinutesOfDay(at) > startMinutes + CHECK_IN_GRACE_MINUTES
    ? "LATE"
    : "ON_TIME";
}

/**
 * The status a check-out is stored with.
 *
 * `Đi muộn` is a fact about the **arrival** and it must survive the departure: an employee who arrived
 * late and left before the end of the ca keeps `LATE` until a manager corrects the row (which records
 * who did it and why), instead of the lateness disappearing behind an `EARLY_LEAVE`. So a check-out only
 * ever marks `EARLY_LEAVE` on a record that was `ON_TIME`, and only while the ca is still running.
 */
export function resolveCheckOutStatus(
  at: Date,
  shiftEndTime: string | null,
  currentStatus: AttendanceStatus,
): AttendanceStatus {
  if (currentStatus === "LATE" || !isShiftStillRunning(at, shiftEndTime)) {
    return currentStatus;
  }

  return "EARLY_LEAVE";
}

/**
 * The status the arrival itself justifies, re-derived from the giờ vào **the row already stores**.
 *
 * The verdict is a function of `check_in_at` and the ca's `start_time`, so it is reproducible and must
 * never be guessed from whatever status a previous write left on the row: the check-out used to replace
 * `LATE` with `EARLY_LEAVE` (a late arrival who left early read "Về sớm"), and a re-open then read
 * "Đúng giờ" even though the employee had arrived hours after the ca opened.
 *
 * A manager's correction is the recorded truth — it carries who changed it and why — so a row that has
 * one keeps its status; so does a row with no giờ vào, because there is nothing to judge.
 */
export function resolveStoredStatus(
  record: Pick<Attendance, "check_in_at" | "status" | "corrected_by">,
  shiftStartTime: string | null,
): AttendanceStatus {
  if (record.corrected_by !== null || record.check_in_at === null) {
    return record.status;
  }

  return resolveCheckInStatus(new Date(record.check_in_at), shiftStartTime);
}

/**
 * Whether the ca's working time is still running: it has an end time and `at` is before it (same grace,
 * so the last few minutes count as a normal finish).
 *
 * This is the rule behind `/check-in`'s "Vào ca lại": an employee who closed the ca by mistake may
 * re-open the same record while the ca is still running, and the endpoint refuses once it is over. It is
 * exactly the opposite of the condition that stored `EARLY_LEAVE`, so a record that reads "Về sớm" is one
 * that can still be re-opened.
 */
export function isShiftStillRunning(
  at: Date,
  shiftEndTime: string | null,
): boolean {
  const endMinutes = parseTimeOfDay(shiftEndTime);

  if (endMinutes === null) {
    return false;
  }

  return businessMinutesOfDay(at) < endMinutes - CHECK_IN_GRACE_MINUTES;
}
