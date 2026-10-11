import type { INotificationRepository } from "@/lib/domain/repositories/INotificationRepository";

/**
 * Marks the caller's whole inbox as read (SCRUM-70). The screen used to send one `PATCH` per row,
 * which left "Đánh dấu tất cả đã đọc" unable to reach anything past the loaded page; this is the
 * single statement the database can answer in one round trip, and it stays inside the caller's own
 * rows (`notifications_update_own`).
 */
export class MarkAllNotificationsReadUseCase {
  constructor(
    private readonly notificationRepository: INotificationRepository,
  ) {}

  /** @returns the number of notifications that moved from unread to read. */
  async execute(userId: string, types?: readonly string[]): Promise<number> {
    return this.notificationRepository.markAllAsRead(userId, types);
  }
}