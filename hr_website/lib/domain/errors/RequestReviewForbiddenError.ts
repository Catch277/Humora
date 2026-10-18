export class RequestReviewForbiddenError extends Error {
  constructor() {
    super("Chỉ chủ sở hữu hoặc quản lý chi nhánh mới duyệt được đơn từ.");
    this.name = "RequestReviewForbiddenError";
  }
}
