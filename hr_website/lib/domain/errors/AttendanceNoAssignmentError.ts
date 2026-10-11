export class AttendanceNoAssignmentError extends Error {
  constructor(message = "You have no scheduled shift to clock in for today.") {
    super(message);
    this.name = "AttendanceNoAssignmentError";
  }
}
