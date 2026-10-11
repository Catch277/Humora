import type { Attendance } from "@/lib/domain/entities/Attendance";
import { workedSecondsOf } from "@/lib/usecases/attendanceWorkedTime";

/** Asia/Bangkok is UTC+7 and observes no DST — the same discipline as `businessDay.ts`. */
const BUSINESS_UTC_OFFSET_HOURS = -7;

/** The hours a ca needs for the auto-close to be judged; structural, so a row's embedded shift fits. */
export type ShiftHours = {
  start_time: string | null;
  end_time: string | null;
} | null | undefined;

/** The record fields the auto-close needs. */
export type AutoCloseRecord = Pick<
  Attendance,
  "work_date" | "check_in_at" | "check_out_at" | "resumed_at" | "worked_seconds"
>;

type HourMinute = { hours: number; minutes: number };

/** `08:00` / `08:00:00` → `{ hours, minutes }`; anything unparsable is `null` (no verdict). */
function parseHourMinute(value: string | null | undefined): HourMinute | null {
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

  return { hours, minutes };
}

function minutesOf(parts: HourMinute): number {
  return parts.hours * 60 + parts.minutes;
}

/**
 * The instant a ca ends, in UTC, built from the work date and the template's `end_time` on the
 * Bangkok wall clock.
 *
 * A template that ends "before" it starts runs past midnight (`22:00–06:00`), so its end belongs to
 * the next day; a zero-length template (`Nghỉ`, `00:00–00:00`) has no end to close anything with and
 * answers `null`, which keeps a day off out of this rule entirely.
 */
export function shiftEndInstant(
  workDate: string,
  shift: ShiftHours,
): Date | null {
  const end = parseHourMinute(shift?.end_time);
  const start = parseHourMinute(shift?.start_time);

  if (!end) {
    return null;
  }

  const [year, month, day] = workDate.split("-").map(Number);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const endOnWorkDate = Date.UTC(
    year,
    month - 1,
    day,
    end.hours + BUSINESS_UTC_OFFSET_HOURS,
    end.minutes,
  );

  if (start && minutesOf(end) === minutesOf(start)) {
    return null;
  }

  if (start && minutesOf(end) < minutesOf(start)) {
    return new Date(endOnWorkDate + 24 * 60 * 60 * 1000);
  }

  return new Date(endOnWorkDate);
}

/**
 * When the system closes an open record by itself: the ca's end time, once that instant has passed and
 * the record carries no giờ ra at all.
 *
 * A missing "Ra ca" click used to leave the record open for ever — the timesheet read `09:14 → --:--`
 * and counted nothing — which is why the end of the ca is the fallback. Two properties matter:
 *
 *   * it never invents a departure for a ca whose end has not been reached (the employee may still
 *     press the button, and a real check-out always wins — see `effectiveCheckOut`);
 *   * an `EARLY_LEAVE` is never derived from it, because forgetting to clock out is not leaving early.
 *
 * A row a manager corrected or closed keeps its stored value untouched: `check_out_at` is not null
 * there, so this answers `null` before it looks at the ca.
 */
export function autoCheckOutAt(
  record: AutoCloseRecord,
  shift: ShiftHours,
  now: Date = new Date(),
): Date | null {
  if (record.check_out_at !== null || record.check_in_at === null) {
    return null;
  }

  const end = shiftEndInstant(record.work_date, shift);

  if (!end || end.getTime() > now.getTime()) {
    return null;
  }

  // A segment that began *after* the ca ended (somebody checked in — or re-opened — too late for this
  // ca) has no end to infer: closing it at the ca's end would print a departure before the arrival.
  // Those rows stay open on purpose, for a manager to correct with who and why.
  const segmentStart = Date.parse(record.resumed_at ?? record.check_in_at);

  if (Number.isNaN(segmentStart) || end.getTime() <= segmentStart) {
    return null;
  }

  return end;
}

/**
 * Giờ ra as every screen should read it: the stored one when there is one, otherwise the ca's end time
 * once the ca is over, flagged `automatic` so the reviewer can tell a click from the fallback (the
 * `Sửa giờ` dialog pre-fills this value, which is what turns it into a recorded fact).
 */
export function effectiveCheckOut(
  record: AutoCloseRecord,
  shift: ShiftHours,
  now: Date = new Date(),
): { at: string | null; automatic: boolean } {
  if (record.check_out_at !== null) {
    return { at: record.check_out_at, automatic: false };
  }

  const automatic = autoCheckOutAt(record, shift, now);

  return automatic
    ? { at: automatic.toISOString(), automatic: true }
    : { at: null, automatic: false };
}

/**
 * Giờ làm with the same fallback applied (SCRUM-69 + the auto-close).
 *
 * An open record that the ca has already outlived counts the segment that began at the giờ vào — or at
 * the last "Vào ca lại" — up to the ca's end, on top of whatever was banked before the pause. Every
 * other case is whatever `workedSecondsOf` already answers.
 */
export function effectiveWorkedSeconds(
  record: AutoCloseRecord,
  shift: ShiftHours,
  now: Date = new Date(),
): number {
  const automatic = autoCheckOutAt(record, shift, now);

  if (!automatic || record.check_in_at === null) {
    return workedSecondsOf(record);
  }

  const segmentStart = Date.parse(record.resumed_at ?? record.check_in_at);

  if (Number.isNaN(segmentStart)) {
    return record.worked_seconds;
  }

  return (
    record.worked_seconds +
    Math.max(0, Math.round((automatic.getTime() - segmentStart) / 1000))
  );
}

/** `effectiveWorkedSeconds` as hours with one decimal (`7,8`), or `null` when nothing was worked. */
export function effectiveWorkedHours(
  record: AutoCloseRecord,
  shift: ShiftHours,
  now: Date = new Date(),
): number | null {
  const seconds = effectiveWorkedSeconds(record, shift, now);

  return seconds === 0 ? null : Math.round((seconds / 3600) * 10) / 10;
}