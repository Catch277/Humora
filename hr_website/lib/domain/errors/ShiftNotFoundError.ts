export class ShiftNotFoundError extends Error {
  constructor() {
    super("Không tìm thấy ca làm việc.");
    this.name = "ShiftNotFoundError";
  }
}
