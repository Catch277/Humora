export class AttendanceCorrectionForbiddenError extends Error {
  constructor() {
    super("Chỉ chủ sở hữu hoặc quản lý chi nhánh mới sửa được bản ghi chấm công.");
    this.name = "AttendanceCorrectionForbiddenError";
  }
}