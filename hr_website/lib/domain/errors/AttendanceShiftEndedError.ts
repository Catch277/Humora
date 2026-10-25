/**
 * A check-in arrived after the ca's working time had closed (SCRUM-68's window, `checkInWindowVerdict`).
 *
 * Clocking in for a ca that is over would invent work that did not happen — the hours are what the worked
 * time and the lateness verdict are derived from — so the endpoint refuses it and the row stays missing
 * for the reviewer to see. This is the same boundary "Vào ca lại" uses, which is why a record that is
 * still open or can still be re-opened never reaches this error.
 */
export class AttendanceShiftEndedError extends Error {
  constructor(shiftName: string, endTime: string) {
    super(
      `Ca “${shiftName}” đã kết thúc lúc ${endTime.slice(0, 5)} nên không thể vào ca được nữa.`,
    );
    this.name = "AttendanceShiftEndedError";
  }
}
