import type {
  NotificationSetting,
  UpdateNotificationSettingInput,
} from "@/lib/domain/entities/NotificationSetting";
import type { INotificationRepository } from "@/lib/domain/repositories/INotificationRepository";

export class UpdateNotificationSettingsUseCase {
  constructor(
    private readonly notificationRepository: INotificationRepository,
  ) {}

  async execute(
    userId: string,
    settings: UpdateNotificationSettingInput[],
  ): Promise<NotificationSetting[]> {
    return this.notificationRepository.upsertSettings(userId, settings);
  }
}
