import type { IAuthService } from "@/lib/domain/repositories/IAuthService";
import type { IUserRepository } from "@/lib/domain/repositories/IUserRepository";
import { newPasswordValidationError } from "@/lib/usecases/credentials";

export type ChangePasswordInput = {
  password: string;
};

/**
 * Leaves the temporary password an owner handed over (SCRUM-52) behind: sets the caller's own
 * password through Supabase Auth and then clears `must_change_password`, which is what the
 * `proxy.ts` gate reads. Both steps use the caller's session, never a service role.
 */
export class ChangePasswordUseCase {
  constructor(
    private readonly authService: IAuthService,
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(input: ChangePasswordInput): Promise<void> {
    const validationError = newPasswordValidationError(input.password);

    if (validationError) {
      throw new Error(validationError);
    }

    await this.authService.updatePassword(input.password);
    await this.userRepository.completePasswordChange();
  }
}