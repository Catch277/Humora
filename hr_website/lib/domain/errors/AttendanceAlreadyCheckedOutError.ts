/**
 * The record named for check-out already carries a `check_out_at` (SCRUM-68). Answering `409` instead of
 * quietly overwriting keeps the stored giờ ra the one the employee actually reported; a wrong time stays
 * the manager's correction (`PATCH /api/attendance/{id}`), which records who fixed it and why.
 */
export class AttendanceAlreadyCheckedOutError extends Error {
  /** The message stays optional so a caller may explain the case; the default is the plain duplicate. */
  constructor(message = "Ca này đã được ghi nhận ra ca rồi.") {
    super(message);
    this.name = "AttendanceAlreadyCheckedOutError";
  }
}
