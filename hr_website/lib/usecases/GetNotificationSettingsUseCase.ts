import type { NotificationSetting } from "@/lib/domain/entities/NotificationSetting";
import type { INotificationRepository } from "@/lib/domain/repositories/INotificationRepository";

export class GetNotificationSettingsUseCase {
  constructor(
    private readonly notificationRepository: INotificationRepository,
  ) {}

  async execute(userId: string): Promise<NotificationSetting[]> {
    return this.notificationRepository.getSettings(userId);
  }
}
