export class ShiftOverlapError extends Error {
  /** `conflictDate` is the business date the clash was found on, for the caller's message. */
  constructor(conflictDate: string) {
    super(`Nhân viên đã có ca trùng vào ngày ${conflictDate}.`);
    this.name = "ShiftOverlapError";
  }
}
