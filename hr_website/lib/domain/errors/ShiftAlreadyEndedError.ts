/**
 * The ca a manager is trying to assign has already finished — either earlier today or on a day that is
 * already gone.
 *
 * `shift_assignments` records *intent* — somebody is going to work this ca — so writing it after the ca
 * is over produces exactly the row nobody can clock in for: the check-in window is only open during the
 * ca. The rule lives in `isShiftAlreadyOver` (`lib/usecases/shiftWindow.ts`) and only guards a **new**
 * assignment; an existing row may still be modified and deleted, which is how a mistake in the past is
 * corrected.
 */
export class ShiftAlreadyEndedError extends Error {
  constructor(shiftName: string, endTime: string, workDate: string) {
    const [year, month, day] = workDate.split("-");

    super(
      `Ca “${shiftName}” ngày ${day}/${month}/${year} đã kết thúc lúc ${endTime.slice(0, 5)} nên không thể xếp cho nhân viên nữa. Chọn ca hoặc ngày khác.`,
    );
    this.name = "ShiftAlreadyEndedError";
  }
}
