import type { AuthSignUpResult } from "@/lib/domain/entities/AuthSignUpResult";
import type { IAuthService } from "@/lib/domain/repositories/IAuthService";
import {
  emailValidationError,
  fullNameValidationError,
  newPasswordValidationError,
} from "@/lib/usecases/credentials";

export type SignUpInput = {
  email: string;
  password: string;
  fullName: string;
};

export class SignUpUseCase {
  constructor(private readonly authService: IAuthService) {}

  async execute(input: SignUpInput): Promise<AuthSignUpResult> {
    const email = input.email.trim();
    const fullName = input.fullName.trim();

    // First failure wins: `app/api/auth/sign-up` maps the message to a `400` naming the field.
    const validationError =
      emailValidationError(email) ??
      newPasswordValidationError(input.password) ??
      fullNameValidationError(fullName);

    if (validationError) {
      throw new Error(validationError);
    }

    return this.authService.signUp(email, input.password, fullName);
  }
}
