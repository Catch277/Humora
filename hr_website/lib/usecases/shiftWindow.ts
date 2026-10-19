import type { Shift } from "@/lib/domain/entities/Shift";
import { getShiftWindow } from "@/lib/usecases/attendanceClock";
import { CHECK_IN_GRACE_MINUTES } from "@/lib/usecases/attendanceStatus";

/**
 * The only part of a ca these rules read: its hours. A `ShiftAssignment`'s embedded template and the
 * catalogue row both satisfy it, so neither caller has to fetch the whole entity.
 */
type ShiftHours = Pick<Shift, "start_time" | "end_time"> | null;

const MINUTE_MS = 60_000;

/**
 * Whether the ca on `workDate` has already finished, as the schedule asks before it puts somebody on it.
 *
 * The comparison is against the ca's real end instant (`getShiftWindow`, Asia/Bangkok), so it covers a ca
 * later today *and* every day already gone: a schedule is a statement about work still to come, and a row
 * on a ca nobody can clock in for (the check-in window is only open during the ca) is exactly what the
 * operation must not accept. Only "the ca is still running, or has not started" passes.
 *
 * Two shapes have no window and are never refused: a template without hours, and the zero-length "Nghỉ".
 * Do not replace this with a minutes-of-day comparison — that is the bug `isShiftStillRunning` still
 * carries for a ca crossing midnight.
 */
export function isShiftAlreadyOver(
  at: Date,
  workDate: string,
  shift: ShiftHours,
): boolean {
  const window = getShiftWindow(workDate, shift);

  return window !== null && at.getTime() >= window.end.getTime();
}

/**
 * The verdict on clocking in against `shift` on `workDate`: `OPEN` while the ca's working time allows a
 * check-in, otherwise which side of the window the arrival missed.
 *
 * The open window is `[start − grace, end − grace]`, the same `CHECK_IN_GRACE_MINUTES` that decides Đi
 * muộn and that already governs "Vào ca lại" (`isShiftStillRunning`), so an arrival a minute before the ca
 * opens, and a tap during its last minutes, are judged exactly like the rest of the attendance
 * arithmetic. Both boundaries are instants, so a ca crossing midnight behaves like a daytime one.
 *
 * `OPEN` also covers what cannot be judged at all — an unscheduled check-in (a manager who named no ca) or
 * a template without hours. Nothing is known about a window there, and inventing one would refuse a
 * check-in the operation allows.
 */
export type CheckInWindowVerdict = "OPEN" | "NOT_STARTED" | "ENDED";

export function checkInWindowVerdict(
  at: Date,
  workDate: string,
  shift: ShiftHours,
): CheckInWindowVerdict {
  const window = getShiftWindow(workDate, shift);

  if (window === null) {
    return "OPEN";
  }

  const grace = CHECK_IN_GRACE_MINUTES * MINUTE_MS;

  if (at.getTime() < window.start.getTime() - grace) {
    return "NOT_STARTED";
  }

  if (at.getTime() > window.end.getTime() - grace) {
    return "ENDED";
  }

  return "OPEN";
}
