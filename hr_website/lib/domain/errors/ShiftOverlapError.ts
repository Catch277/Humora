export class ShiftOverlapError extends Error {
  /** `conflictDate` is the business date the clash was found on, for the caller's message. */
  constructor(conflictDate: string) {
    super(`The employee already has an overlapping shift on ${conflictDate}.`);
    this.name = "ShiftOverlapError";
  }
}
