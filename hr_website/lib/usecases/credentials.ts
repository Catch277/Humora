/**
 * Shared credential validation for the sign-in and sign-up use cases. The messages are worded
 * here, once, because `app/api/auth/*` maps them to `400` by their opening words; the screens
 * translate them into Vietnamese copy for the user.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Supabase Auth accepts 6 by default; the extra two characters are a project-side choice. */
const MIN_PASSWORD_LENGTH = 8;

export function emailValidationError(email: string): string | null {
  return EMAIL_PATTERN.test(email)
    ? null
    : "email must be a valid email address.";
}

/** Sign-in only checks that something was typed — the server decides whether it is correct. */
export function passwordValidationError(password: string): string | null {
  return password ? null : "password is required.";
}

export function newPasswordValidationError(password: string): string | null {
  return password.length >= MIN_PASSWORD_LENGTH
    ? null
    : `password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
}

export function fullNameValidationError(fullName: string): string | null {
  return fullName.length > 0 && fullName.length <= 120
    ? null
    : "full_name must be a non-empty string of at most 120 characters.";
}
