/**
 * No `SCHEDULED` shift assignment for the caller on the business day they check in for (SCRUM-68).
 *
 * A check-in is always tied to the ca it belongs to — the ca carries the hours a lateness verdict is
 * measured against — and `attendance.shift_id` is what tells two ca of the same day apart. So an
 * employee with nothing scheduled reads this sentence instead of an insert the database would refuse.
 */
export class AttendanceNoShiftTodayError extends Error {
  constructor() {
    super(
      "Bạn không có ca làm việc nào được xếp cho ngày làm việc này nên không có ca để chấm công.",
    );
    this.name = "AttendanceNoShiftTodayError";
  }
}
