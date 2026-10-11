export class AttendanceClockInputError extends Error {
  constructor(message = "The clock-in or clock-out data is invalid.") {
    super(message);
    this.name = "AttendanceClockInputError";
  }
}
