export class AttendanceCorrectionForbiddenError extends Error {
  constructor() {
    super("Only a manager (OWNER/MANAGER) may correct an attendance record.");
    this.name = "AttendanceCorrectionForbiddenError";
  }
}