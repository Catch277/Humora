export class AttendanceComplaintForbiddenError extends Error {
  constructor() {
    super(
      "Only the employee on the record or a manager (OWNER/MANAGER) may change this complaint.",
    );
    this.name = "AttendanceComplaintForbiddenError";
  }
}