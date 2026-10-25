export class ShiftRegistrationNotFoundError extends Error {
  constructor(message = "Không tìm thấy đăng ký ca.") {
    super(message);
    this.name = "ShiftRegistrationNotFoundError";
  }
}
