/**
 * The caller already has an attendance row for this ca and this business day (SCRUM-68).
 *
 * Two things wear this error: the row is still open (a plain duplicate), or it was closed and the ca has
 * already ended, so the check-out stands — the second case passes its own sentence, because "Vào ca lại"
 * is refused for a different reason than a double check-in.
 *
 * Two ca in one day are two rows — `attendance_employee_shift_day_idx` is unique on
 * `(employee_id, work_date, shift_id)` and Postgres treats NULLs as distinct, so the use case compares
 * the `shift_id` itself (null-safe) to catch the unscheduled case the index cannot. The repository also
 * translates the index's `23505` into this class, which is how a race between two saves ends up saying
 * the same thing.
 */
export class AttendanceAlreadyCheckedInError extends Error {
  constructor(message = "Ca này hôm nay đã được vào ca rồi.") {
    super(message);
    this.name = "AttendanceAlreadyCheckedInError";
  }
}
