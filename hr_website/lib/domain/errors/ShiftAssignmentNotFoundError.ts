export class ShiftAssignmentNotFoundError extends Error {
  constructor() {
    super("Không tìm thấy ca đã xếp.");
    this.name = "ShiftAssignmentNotFoundError";
  }
}
