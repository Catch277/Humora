import type { PaginatedNotifications } from "@/lib/domain/entities/Notification";
import type {
  INotificationRepository,
  NotificationQuery,
} from "@/lib/domain/repositories/INotificationRepository";

export class GetUserNotificationsUseCase {
  constructor(
    private readonly notificationRepository: INotificationRepository,
  ) {}

  /**
   * @param query `unreadOnly` — khi `true`, chỉ đếm/trả về thông báo chưa đọc. Header dùng
   *   `pageSize = 1` + cờ này để lấy con số chưa đọc chính xác cho badge trên chuông.
   *   `types` — bộ lọc theo nhóm (SCRUM-70): các chip trên /notifications gửi danh sách mã
   *   `notifications.type`, và bộ lọc chạy ở database nên số trang khớp với số dòng hiển thị.
   */
  async execute(
    userId: string,
    page: number,
    pageSize: number,
    query: NotificationQuery = {},
  ): Promise<PaginatedNotifications> {
    return this.notificationRepository.findByUserId(
      userId,
      page,
      pageSize,
      query,
    );
  }
}
