export class ShiftSwapNotFoundError extends Error {
  constructor(message = "Không tìm thấy yêu cầu chuyển ca.") {
    super(message);
    this.name = "ShiftSwapNotFoundError";
  }
}
