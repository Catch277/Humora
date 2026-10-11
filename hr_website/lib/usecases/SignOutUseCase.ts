import type { IAuthService } from "@/lib/domain/repositories/IAuthService";

export class SignOutUseCase {
  constructor(private readonly authService: IAuthService) {}

  async execute(): Promise<void> {
    await this.authService.signOut();
  }
}
