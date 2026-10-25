/**
 * A check-in arrived before the ca's working time opened (SCRUM-68's window, `checkInWindowVerdict`).
 *
 * An arrival is recorded *for* a ca — the hours are what the lateness verdict is measured against — so
 * clocking in hours early would store a record the ca's own arithmetic cannot describe. The window opens
 * `CHECK_IN_GRACE_MINUTES` before the start, and a manager who judges a genuine exception can still write
 * the record through the corrections flow.
 */
export class AttendanceShiftNotStartedError extends Error {
  constructor(shiftName: string, startTime: string) {
    super(
      `Ca “${shiftName}” bắt đầu lúc ${startTime.slice(0, 5)} nên chưa tới giờ vào ca.`,
    );
    this.name = "AttendanceShiftNotStartedError";
  }
}
