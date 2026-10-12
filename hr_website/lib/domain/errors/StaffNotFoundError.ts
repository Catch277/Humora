export class StaffNotFoundError extends Error {
  constructor() {
    super("Không tìm thấy nhân sự.");
    this.name = "StaffNotFoundError";
  }
}