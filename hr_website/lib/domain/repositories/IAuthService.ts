import type { AuthSession } from "@/lib/domain/entities/AuthSession";
import type { AuthSignUpResult } from "@/lib/domain/entities/AuthSignUpResult";

export interface IAuthService {
  signIn(email: string, password: string): Promise<AuthSession>;
  signUp(
    email: string,
    password: string,
    fullName: string,
  ): Promise<AuthSignUpResult>;
  signOut(): Promise<void>;
  /**
   * Replaces the password of the signed-in account (SCRUM-52). Runs with the caller's own session
   * — no service role is involved — and is how an owner-provisioned account leaves the temporary
   * password behind.
   */
  updatePassword(password: string): Promise<void>;
}

