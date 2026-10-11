export class AttendanceNotFoundError extends Error {
  constructor() {
    super("Attendance record not found.");
    this.name = "AttendanceNotFoundError";
  }
}