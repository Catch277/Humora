export class RequestNotFoundError extends Error {
  constructor() {
    super("Không tìm thấy đơn từ.");
    this.name = "RequestNotFoundError";
  }
}
