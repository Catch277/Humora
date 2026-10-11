import type { AuthSession } from "@/lib/domain/entities/AuthSession";
import type { IAuthService } from "@/lib/domain/repositories/IAuthService";
import {
  emailValidationError,
  passwordValidationError,
} from "@/lib/usecases/credentials";

export type SignInInput = {
  email: string;
  password: string;
};

export class SignInUseCase {
  constructor(private readonly authService: IAuthService) {}

  async execute(input: SignInInput): Promise<AuthSession> {
    const email = input.email.trim();
    const validationError =
      emailValidationError(email) ?? passwordValidationError(input.password);

    if (validationError) {
      throw new Error(validationError);
    }

    return this.authService.signIn(email, input.password);
  }
}

