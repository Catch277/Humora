export class AttendanceAmbiguousShiftError extends Error {
  constructor(message = "You have several shifts today; say which one you are starting.") {
    super(message);
    this.name = "AttendanceAmbiguousShiftError";
  }
}
