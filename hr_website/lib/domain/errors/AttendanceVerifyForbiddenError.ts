export class AttendanceVerifyForbiddenError extends Error {
  constructor() {
    super("Only a manager (OWNER/MANAGER) may verify an attendance record.");
    this.name = "AttendanceVerifyForbiddenError";
  }
}