export class AttendanceNotFoundError extends Error {
  constructor() {
    super("Không tìm thấy bản ghi chấm công.");
    this.name = "AttendanceNotFoundError";
  }
}