export class NotificationNotFoundError extends Error {
  constructor() {
    super("Không tìm thấy thông báo.");
    this.name = "NotificationNotFoundError";
  }
}
