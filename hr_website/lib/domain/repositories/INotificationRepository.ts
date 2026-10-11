import type { PaginatedNotifications } from "@/lib/domain/entities/Notification";
import type {
  NotificationSetting,
  UpdateNotificationSettingInput,
} from "@/lib/domain/entities/NotificationSetting";

/** What the inbox may be narrowed to. Both filters are applied by the database, not by the screen. */
export interface NotificationQuery {
  /** Only the unread rows — and, with `pageSize = 1`, the exact count the header badge shows. */
  unreadOnly?: boolean;
  /** Only the rows already read (the "Đã đọc" tab). Mutually exclusive with `unreadOnly`. */
  readOnly?: boolean;
  /** A whitelist of `notifications.type` codes (the category chips expand to their codes). */
  types?: readonly string[];
}

export interface INotificationRepository {
  findByUserId(
    userId: string,
    page: number,
    pageSize: number,
    query?: NotificationQuery,
  ): Promise<PaginatedNotifications>;

  markAsRead(id: string, userId: string): Promise<void>;

  /** Marks every unread notification of the caller (optionally of the given types) as read. */
  markAllAsRead(userId: string, types?: readonly string[]): Promise<number>;

  getSettings(userId: string): Promise<NotificationSetting[]>;

  upsertSettings(
    userId: string,
    settings: UpdateNotificationSettingInput[],
  ): Promise<NotificationSetting[]>;
}
