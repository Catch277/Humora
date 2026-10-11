/**
 * There is no attendance row to close for this business day (SCRUM-68): the caller never checked in, or
 * named an `attendance_id` that is not one of today's own rows. The record is simply absent, hence `404`
 * — the same distinction the complaint route draws between "not there" and "not allowed".
 */
export class AttendanceNotCheckedInError extends Error {
  constructor() {
    super("No check-in was found for this business day.");
    this.name = "AttendanceNotCheckedInError";
  }
}
