import type { Attendance } from "@/lib/domain/entities/Attendance";

/**
 * The seconds a record counts as **worked** (SCRUM-69).
 *
 * `worked_seconds` is the database's accumulated total: each check-out added the segment that began at the
 * check-in — or at the last "Vào ca lại" — so the pause between leaving and rejoining is not in it, and a
 * manager's correction reset it to the corrected pair. It is derived in the database
 * (`attendance_track_worked_time`) so both screens and the mobile app agree on one number.
 *
 * The fallback is for a row written before that script was applied, where the two timestamps are the only
 * evidence there is; it is also what a row that was never closed answers (0 — nothing worked yet).
 */
export function workedSecondsOf(
  record: Pick<Attendance, "check_in_at" | "check_out_at" | "worked_seconds">,
): number {
  if (record.worked_seconds > 0) {
    return record.worked_seconds;
  }

  if (!record.check_in_at || !record.check_out_at) {
    return 0;
  }

  const start = Date.parse(record.check_in_at);
  const end = Date.parse(record.check_out_at);

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return 0;
  }

  return Math.round((end - start) / 1000);
}

/**
 * The same figure as hours with one decimal (`1,2`), or `null` when the record has worked nothing yet — a
 * ca that is still open, or one whose check-out has not been reached. `vi-VN` formats the comma.
 */
export function workedHoursOf(
  record: Pick<Attendance, "check_in_at" | "check_out_at" | "worked_seconds">,
): number | null {
  const seconds = workedSecondsOf(record);

  return seconds === 0 ? null : Math.round((seconds / 3600) * 10) / 10;
}
