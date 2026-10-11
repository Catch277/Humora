import type { INotificationRepository } from "@/lib/domain/repositories/INotificationRepository";

export class MarkNotificationReadUseCase {
  constructor(
    private readonly notificationRepository: INotificationRepository,
  ) {}

  async execute(id: string, userId: string): Promise<void> {
    return this.notificationRepository.markAsRead(id, userId);
  }
}
