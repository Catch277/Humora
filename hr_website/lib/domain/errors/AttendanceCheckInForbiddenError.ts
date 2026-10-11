/**
 * The organization's OWNER may not clock in (SCRUM-68): they stand above the operation, so
 * `/api/attendance/check-in` and `/api/attendance/check-out` are for employees and managers only.
 *
 * The capability table already keeps the owner out (`lib/accessPolicy.ts` filters `attendance:checkin`
 * out of `OWNER_CAPABILITIES`, so the route answers `403` before this class is reached) and
 * `attendance_insert_own` refuses the row in the database; this is the middle layer, so the rule holds
 * even if a use case is ever called from somewhere that skipped the capability check.
 */
export class AttendanceCheckInForbiddenError extends Error {
  constructor() {
    super(
      "The organization's owner does not clock in; only employees and managers do.",
    );
    this.name = "AttendanceCheckInForbiddenError";
  }
}
