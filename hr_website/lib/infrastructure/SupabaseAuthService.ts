import type { AuthSession } from "@/lib/domain/entities/AuthSession";
import type { AuthSignUpResult } from "@/lib/domain/entities/AuthSignUpResult";
import { EmailAlreadyRegisteredError } from "@/lib/domain/errors/EmailAlreadyRegisteredError";
import { InvalidCredentialsError } from "@/lib/domain/errors/InvalidCredentialsError";
import type { IAuthService } from "@/lib/domain/repositories/IAuthService";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

export class SupabaseAuthService implements IAuthService {
  async signIn(email: string, password: string): Promise<AuthSession> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // A 400 covers "invalid_credentials" and also "email_not_confirmed"; both mean the
      // caller cannot start a session, so the caller-safe error is the credentials one.
      if (error.status === 400) {
        throw new InvalidCredentialsError();
      }

      throw new Error(`Unable to sign in: ${error.message}`);
    }

    if (!data.user) {
      throw new InvalidCredentialsError();
    }

    return { userId: data.user.id, email: data.user.email ?? email };
  }

  async signUp(
    email: string,
    password: string,
    fullName: string,
  ): Promise<AuthSignUpResult> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Lands in `auth.users.raw_user_meta_data.full_name`; the SCRUM-50 trigger copies it
        // into `public.users.full_name` when the profile row is created.
        data: { full_name: fullName },
      },
    });

    if (error) {
      // 422 / "user_already_exists" is the answer when email confirmation is off.
      if (
        error.status === 422 ||
        error.code === "user_already_exists" ||
        error.code === "email_exists"
      ) {
        throw new EmailAlreadyRegisteredError();
      }

      throw new Error(`Unable to sign up: ${error.message}`);
    }

    if (!data.user) {
      throw new Error("Unable to sign up: Supabase returned no user.");
    }

    // With email confirmation on, Supabase answers a known address with a user that has no
    // identities instead of an error, so it never discloses which addresses are registered.
    if (data.user.identities?.length === 0) {
      throw new EmailAlreadyRegisteredError();
    }

    return {
      userId: data.user.id,
      email: data.user.email ?? email,
      // No session means the project requires the confirmation email before signing in.
      emailConfirmationRequired: data.session === null,
    };
  }

  async signOut(): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw new Error(`Unable to sign out: ${error.message}`);
    }
  }

  async updatePassword(password: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      // Weak passwords come back as a 422 from Supabase Auth; the use case catches the length
      // problem before this, so anything here is worth surfacing verbatim.
      throw new Error(`Unable to change the password: ${error.message}`);
    }
  }
}

