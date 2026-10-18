export class AttendanceVerifyForbiddenError extends Error {
  constructor() {
    super("Chỉ chủ sở hữu hoặc quản lý chi nhánh mới xác nhận được bản ghi chấm công.");
    this.name = "AttendanceVerifyForbiddenError";
  }
}