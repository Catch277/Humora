/**
 * More than one ca of the caller is still open on this business day, so a check-out that names no
 * `attendance_id` cannot tell which one to close (SCRUM-68). The screen closes a specific row from the
 * "hôm nay" list, so this is the answer to a hand-written request that would otherwise silently end the
 * wrong ca.
 */
export class AttendanceCheckOutAmbiguousError extends Error {
  constructor() {
    super(
      "More than one shift is still open today; send attendance_id to say which one to close.",
    );
    this.name = "AttendanceCheckOutAmbiguousError";
  }
}
