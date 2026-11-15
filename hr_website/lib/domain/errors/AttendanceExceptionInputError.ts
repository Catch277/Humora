/**
 * The body of a SCRUM-97 resolution is not usable: `RESOLVED` arrived without the note the database
 * requires, or the note is longer than the column's contract. A domain error rather than a route check
 * because "a resolution needs a reason" is the rule the CHECK constraint states as well — the two must
 * not be able to disagree.
 */
export class AttendanceExceptionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttendanceExceptionInputError";
  }
}
