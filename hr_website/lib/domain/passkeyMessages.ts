import type { MessageKey, Translate } from "@/lib/i18n/translate";
import { translateVi } from "@/lib/i18n/translate";

/**
 * The dictionary keys of every failure a passkey call can produce (SCRUM-79).
 *
 * It sits in `lib/domain` next to `notificationCatalog.ts` for the same reason: one copy of the mapping,
 * shared by `/login` (sign in) and `/security` (register, rename, delete). The wording itself lives in
 * `lib/i18n/messages/*` — a screen that passes `useLocale().t` gets the reader's language, one that does
 * not keeps the Vietnamese sentence. The argument is `unknown` and its fields are read structurally, so
 * this file imports neither Supabase nor Next.js — `lib/domain` stays framework-free — while both
 * vocabularies are still matched by value:
 *
 * - the `passkey_*` / `webauthn_*` codes Supabase Auth answers with (listed in the passkey guide but not
 *   part of the installed `ErrorCode` union, hence a plain string comparison), and
 * - the `ERROR_*` codes of the WebAuthn spec that `@supabase/auth-js` wraps a browser error in
 *   (`WebAuthnError.code`) — where "the user cancelled" and "not a secure context" come from.
 */
const PASSKEY_MESSAGE_KEYS: Readonly<Record<string, MessageKey>> = {
  passkey_disabled: "passkey.disabled",
  too_many_passkeys: "passkey.tooMany",
  webauthn_credential_exists: "passkey.credentialExists",
  webauthn_credential_not_found: "passkey.credentialNotFound",
  webauthn_challenge_not_found: "passkey.challengeNotFound",
  webauthn_challenge_expired: "passkey.challengeExpired",
  webauthn_verification_failed: "passkey.verificationFailed",
  ERROR_CEREMONY_ABORTED: "passkey.ceremonyAborted",
  ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE: "passkey.userVerificationFailed",
  ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED: "passkey.previouslyRegistered",
  ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT:
    "passkey.noDiscoverableCredential",
  ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT: "passkey.noUserVerification",
  ERROR_INVALID_RP_ID: "passkey.invalidRpId",
  ERROR_INVALID_DOMAIN: "passkey.invalidDomain",
  over_request_rate_limit: "passkey.rateLimited",
  session_not_found: "passkey.sessionNotFound",
};

/** Browser-level names, for the cases the SDK rethrows a DOM exception instead of a coded error. */
const BROWSER_MESSAGE_KEYS: Readonly<Record<string, MessageKey>> = {
  NotAllowedError: "passkey.ceremonyAborted",
  AbortError: "passkey.ceremonyAborted",
  SecurityError: "passkey.browser.insecure",
  NotSupportedError: "passkey.browser.unsupported",
  InvalidStateError: "passkey.previouslyRegistered",
};

function readErrorField(error: unknown, field: "code" | "name"): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  // Structural read of a foreign error object: importing the SDK's error classes (`AuthError`,
  // `WebAuthnError`) would put a Supabase dependency into `lib/domain`, and these two fields are the
  // only machine-readable reason either of them carries.
  const value = (error as Record<string, unknown>)[field];

  return typeof value === "string" ? value : null;
}

/**
 * The sentence a failed passkey call should show.
 *
 * `t` is optional and last: `/login` and `/security` pass `useLocale().t`, and a caller that does not
 * keeps the Vietnamese sentence. The fallback is a key too, so an unrecognised error is still translated.
 */
export function passkeyErrorMessage(
  error: unknown,
  t: Translate = translateVi,
): string {
  const code = readErrorField(error, "code");
  const codeKey = code ? PASSKEY_MESSAGE_KEYS[code] : undefined;

  if (codeKey) {
    return t(codeKey);
  }

  const name = readErrorField(error, "name");
  const nameKey = name ? BROWSER_MESSAGE_KEYS[name] : undefined;

  return nameKey ? t(nameKey) : t("passkey.fallback");
}
