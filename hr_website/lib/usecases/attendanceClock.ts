import type { AttendanceStatus } from "@/lib/domain/entities/Attendance";
import type { ClockPointInput } from "@/lib/domain/entities/AttendanceClock";
import {
  MAX_CLOCK_NOTE_LENGTH,
  MAX_CLOCK_PHOTO_URL_LENGTH,
} from "@/lib/domain/entities/AttendanceClock";
import type { Shift } from "@/lib/domain/entities/Shift";
import { AttendanceClockInputError } from "@/lib/domain/errors/AttendanceClockInputError";

/**
 * Minutes of tolerance before a clock-in counts as `LATE` or a clock-out as `EARLY_LEAVE`.
 * One constant so the rule can be tuned in one place.
 */
export const CLOCK_GRACE_MINUTES = 5;

const MINUTE_MS = 60_000;

/** Shift hours are business-time (Asia/Bangkok, UTC+7, no DST) — see `businessDay.ts`. */
const BUSINESS_UTC_OFFSET = "+07:00";

function toInstant(workDate: string, time: string): Date | null {
  // Postgres `time` arrives as "08:00:00"; tolerate "08:00" too.
  const [hours, minutes, seconds] = time.split(":");

  if (hours === undefined || minutes === undefined) {
    return null;
  }

  const instant = new Date(
    `${workDate}T${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}:${(seconds ?? "00").padStart(2, "0")}${BUSINESS_UTC_OFFSET}`,
  );

  return Number.isNaN(instant.getTime()) ? null : instant;
}

/**
 * The real start and end instants of `shift` on `workDate`. `null` when the template has no hours,
 * or is the zero-length "Nghỉ" day off — nothing to clock in for. A shift whose end is not after its
 * start runs past midnight, so its end lands on the next day.
 */
export function getShiftWindow(
  workDate: string,
  shift: Shift | null,
): { start: Date; end: Date } | null {
  if (!shift || !shift.start_time || !shift.end_time) {
    return null;
  }

  const start = toInstant(workDate, shift.start_time);
  let end = toInstant(workDate, shift.end_time);

  if (!start || !end || shift.start_time === shift.end_time) {
    return null;
  }

  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * MINUTE_MS);
  }

  return { start, end };
}

/** `LATE` once the grace period after the start is over, otherwise `ON_TIME`. */
export function resolveCheckInStatus(
  now: Date,
  window: { start: Date } | null,
): AttendanceStatus {
  if (!window) {
    return "ON_TIME";
  }

  return now.getTime() > window.start.getTime() + CLOCK_GRACE_MINUTES * MINUTE_MS
    ? "LATE"
    : "ON_TIME";
}

/**
 * The status after clocking out. A late arrival stays `LATE` (one column cannot carry both facts, and
 * the late arrival came first); otherwise leaving before the end, beyond the grace period, is
 * `EARLY_LEAVE`.
 */
export function resolveCheckOutStatus(
  now: Date,
  window: { end: Date } | null,
  currentStatus: AttendanceStatus,
): AttendanceStatus {
  if (currentStatus === "LATE") {
    return "LATE";
  }

  if (
    window &&
    now.getTime() < window.end.getTime() - CLOCK_GRACE_MINUTES * MINUTE_MS
  ) {
    return "EARLY_LEAVE";
  }

  return "ON_TIME";
}

/** Validates what the mobile app sent and returns it trimmed; throws `AttendanceClockInputError`. */
export function normalizeClockPoint(input: ClockPointInput): ClockPointInput {
  if (
    !Number.isFinite(input.latitude) ||
    input.latitude < -90 ||
    input.latitude > 90
  ) {
    throw new AttendanceClockInputError(
      "latitude must be a number between -90 and 90.",
    );
  }

  if (
    !Number.isFinite(input.longitude) ||
    input.longitude < -180 ||
    input.longitude > 180
  ) {
    throw new AttendanceClockInputError(
      "longitude must be a number between -180 and 180.",
    );
  }

  const note = input.note?.trim() || null;

  if (note && note.length > MAX_CLOCK_NOTE_LENGTH) {
    throw new AttendanceClockInputError(
      `note must be at most ${MAX_CLOCK_NOTE_LENGTH} characters.`,
    );
  }

  const photoUrl = input.photoUrl?.trim() || null;

  if (photoUrl && photoUrl.length > MAX_CLOCK_PHOTO_URL_LENGTH) {
    throw new AttendanceClockInputError(
      `photo_url must be at most ${MAX_CLOCK_PHOTO_URL_LENGTH} characters.`,
    );
  }

  return { latitude: input.latitude, longitude: input.longitude, photoUrl, note };
}
