/**
 * Vietnamese copy for the failures a passkey call can produce (SCRUM-79).
 *
 * It sits in `lib/domain` next to `notificationCatalog.ts` for the same reason: one copy of the wording,
 * shared by `/login` (sign in) and `/security` (register, rename, delete). The argument is `unknown` and
 * its fields are read structurally, so this file imports neither Supabase nor Next.js — `lib/domain`
 * stays framework-free — while both vocabularies are still matched by value:
 *
 * - the `passkey_*` / `webauthn_*` codes Supabase Auth answers with (listed in the passkey guide but not
 *   part of the installed `ErrorCode` union, hence a plain string comparison), and
 * - the `ERROR_*` codes of the WebAuthn spec that `@supabase/auth-js` wraps a browser error in
 *   (`WebAuthnError.code`) — where "the user cancelled" and "not a secure context" come from.
 */
const PASSKEY_MESSAGES: Readonly<Record<string, string>> = {
  passkey_disabled:
    "Dự án Supabase chưa bật Passkey. Hãy bật ở Authentication → Passkeys trong Dashboard rồi thử lại.",
  too_many_passkeys: "Tài khoản đã đạt giới hạn số Passkey. Hãy xoá bớt một thiết bị.",
  webauthn_credential_exists: "Thiết bị này đã đăng ký Passkey cho tài khoản của bạn.",
  webauthn_credential_not_found: "Thiết bị này chưa đăng ký Passkey cho tài khoản nào.",
  webauthn_challenge_not_found: "Yêu cầu xác thực đã hết hiệu lực. Vui lòng thử lại.",
  webauthn_challenge_expired: "Yêu cầu xác thực đã hết hạn. Vui lòng thử lại.",
  webauthn_verification_failed: "Không xác minh được Passkey. Vui lòng thử lại.",
  ERROR_CEREMONY_ABORTED: "Bạn đã huỷ xác thực trên thiết bị.",
  ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE:
    "Thiết bị chưa xác minh được danh tính. Vui lòng thử lại.",
  ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED:
    "Thiết bị này đã đăng ký Passkey cho tài khoản của bạn.",
  ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT:
    "Thiết bị không hỗ trợ Passkey dùng để đăng nhập.",
  ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT:
    "Thiết bị không hỗ trợ xác thực bằng Face ID / vân tay.",
  ERROR_INVALID_RP_ID: "Tên miền hiện tại không khớp với Relying Party ID của Supabase Auth.",
  ERROR_INVALID_DOMAIN:
    "Trình duyệt không cho phép WebAuthn trên địa chỉ này (cần HTTPS hoặc localhost).",
  over_request_rate_limit: "Có quá nhiều yêu cầu. Vui lòng chờ một lát rồi thử lại.",
  session_not_found: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
};

/** Browser-level names, for the cases the SDK rethrows a DOM exception instead of a coded error. */
const BROWSER_MESSAGES: Readonly<Record<string, string>> = {
  NotAllowedError: "Bạn đã huỷ xác thực trên thiết bị.",
  AbortError: "Bạn đã huỷ xác thực trên thiết bị.",
  SecurityError: "Trình duyệt chặn WebAuthn: trang phải chạy trên HTTPS (hoặc localhost).",
  NotSupportedError: "Thiết bị hoặc trình duyệt không hỗ trợ Passkey.",
  InvalidStateError: "Thiết bị này đã đăng ký Passkey cho tài khoản của bạn.",
};

const FALLBACK_MESSAGE = "Không thực hiện được xác thực trên thiết bị. Vui lòng thử lại.";

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

export function passkeyErrorMessage(error: unknown): string {
  const code = readErrorField(error, "code");

  if (code && PASSKEY_MESSAGES[code]) {
    return PASSKEY_MESSAGES[code];
  }

  const name = readErrorField(error, "name");

  if (name && BROWSER_MESSAGES[name]) {
    return BROWSER_MESSAGES[name];
  }

  return FALLBACK_MESSAGE;
}
