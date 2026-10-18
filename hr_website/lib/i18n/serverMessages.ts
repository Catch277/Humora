import type {
  MessageKey,
  Translate,
  TranslationParams,
} from "@/lib/i18n/translate";

/**
 * What a failed request shows the reader.
 *
 * Every screen used to keep its own `actionErrorMessage(status, data, t)` / `statusMessage(...)`, and the
 * copies drifted: the same `403` read "Chỉ chủ sở hữu (OWNER) mới quản lý được nhân sự." on `/staff`,
 * "Bạn không có quyền…" elsewhere, and one copy still answered in Vietnamese inside an English screen.
 * This module is the one copy of the *order*, while each screen keeps the one thing only it knows: what a
 * status means on that screen (a `403` on `/attendance` is "not your branch"; on `/organization` it is
 * "owner only"). Those sentences arrive as `overrides`.
 *
 * The API contract does **not** change: routes keep answering Vietnamese (the mobile app reads the same
 * payloads). A sentence the token table knows is rendered from the dictionary; an unknown one is shown
 * verbatim, because a server sentence that names the offending field beats a generic one. Nothing here
 * imports Supabase or Next.js — `lib/i18n` stays framework-free.
 */
export type ServerErrorBody = { error?: string } | null;

/**
 * The sentence for a status when the server sent nothing useful. `401` is here rather than in the table
 * below because an expired session is never the server's wording to choose.
 */
const DEFAULT_STATUS_KEYS: Record<number, MessageKey> = {
  400: "error.invalidRequest",
  401: "error.sessionExpired",
  403: "error.forbidden",
  404: "error.notFound",
  409: "error.conflict",
  429: "error.tooMany",
  500: "error.generic",
  503: "error.unavailable",
};

type SentenceRule = {
  /** Matched against the whole server sentence — anchored, so a rule cannot fire on a coincidence. */
  test: RegExp;
  key: MessageKey;
  /** `true` when the rule's first group is the offending field name, passed to the sentence as `{field}`. */
  field?: true;
};

/**
 * Server sentences worth translating, matched on a **stable token** rather than the whole phrase — the
 * convention DESIGN.md §8 records, and the same one `organizationErrorResponse.ts` uses to pick a status.
 * Two families cover most of the traffic:
 *
 * 1. **Request validation** (`Nội dung yêu cầu phải là JSON hợp lệ.`, `branch_id phải là UUID.`,
 *    `note tối đa 500 ký tự.`, …). ~40 distinct sentences across the routes, all of them "the payload is
 *    malformed" — a state the UI itself has to have produced, which is why one sentence per *shape* is
 *    enough and why the field name is interpolated instead of enumerated.
 * 2. **Business rules and auth** that a person actually reads: the role gates, the branch scope, the wrong
 *    password, the join code, the geocoder.
 *
 * Order matters: first match wins, so the broad `Nội dung yêu cầu` rule sits above the field rule and the
 * field rule above the `Không thể …` fallback.
 */
const SENTENCE_RULES: ReadonlyArray<SentenceRule> = [
  // "Nội dung yêu cầu phải là JSON hợp lệ." / "…phải là một đối tượng JSON."
  { test: /JSON hợp lệ|một đối tượng JSON/i, key: "error.invalidRequest" },
  // "<field> phải là …", "<field> là bắt buộc…", "<field> không phải …", "<field> tối đa …"
  {
    test: /^([a-z][a-z0-9_]*(?: và [a-z][a-z0-9_]*)*)\s+(?:phải|là bắt buộc|không phải|tối đa)/,
    key: "error.invalidField",
    field: true,
  },
  { test: /^Bạn cần đăng nhập/, key: "error.signInRequired" },
  // "…hoặc quản lý chi nhánh…" must come first: it is a *wider* role than the owner alone, so mapping it
  // to `error.ownerOnly` would tell a branch manager they cannot do what they are allowed to do.
  { test: /^Chỉ chủ sở hữu hoặc/, key: "error.operatorOnly" },
  { test: /^Chỉ chủ sở hữu/, key: "error.ownerOnly" },
  { test: /^Bạn chỉ quản lý được chi nhánh/, key: "error.branchPermission" },
  { test: /^Email hoặc mật khẩu không đúng/, key: "error.credentials" },
  { test: /^Tài khoản này đã thuộc một tổ chức/, key: "error.alreadyInOrganization" },
  { test: /^Tài khoản chưa có hồ sơ người dùng/, key: "error.noProfile" },
  { test: /^Mã tham gia không đúng/, key: "error.joinCode" },
  { test: /^Hôm nay chi nhánh này chưa khai báo mở ca/, key: "error.revenueNotOpen" },
  { test: /^Hôm nay chi nhánh này đã khai báo mở ca/, key: "error.revenueAlreadyOpen" },
  { test: /^Dịch vụ tra cứu địa chỉ/, key: "error.geocodingUnavailable" },
  { test: /^Không tìm thấy /, key: "error.notFound" },
  // The server's own kind of generic failure ("Không thể tải danh mục ca.", "Không thể tạo chi nhánh.").
  // The sentence names *what* failed, which a reader in English cannot use, so it collapses into one.
  // A screen for which that failure is actionable overrides the status instead.
  { test: /^Không thể /, key: "error.operationFailed" },
];

type SentenceMatch = { key: MessageKey; params?: TranslationParams };

/**
 * The dictionary sentence for a server message, or `null` when the token table does not know it.
 * Exported because a screen with its own extra rule (`/organization`'s stale Edge Function) wants to match
 * before falling back to the generic chain.
 */
export function serverSentence(message: string | undefined): SentenceMatch | null {
  const text = message?.trim();

  if (!text) {
    return null;
  }

  for (const rule of SENTENCE_RULES) {
    const match = rule.test.exec(text);

    if (match) {
      return { key: rule.key, params: rule.field ? { field: match[1] } : undefined };
    }
  }

  return null;
}

/**
 * The sentence a failed request shows.
 *
 * Order, and each step exists for a reason:
 *
 * 1. **The screen's override** for this status — only the screen can say what a `403` means there.
 * 2. **A known token** in the server sentence → the dictionary sentence (`{field}` interpolated).
 * 3. **The server sentence verbatim** — unknown wording still names the field or the rule it broke.
 * 4. **The default sentence** for this status.
 * 5. `error.generic`.
 *
 * A screen therefore only passes the statuses whose *wording* it owns; everything else is shared.
 */
export function errorMessageFor(
  status: number,
  body: ServerErrorBody,
  t: Translate,
  overrides: Readonly<Record<number, MessageKey>> = {},
): string {
  const override = overrides[status];

  if (override) {
    return t(override);
  }

  const message = typeof body?.error === "string" ? body.error : undefined;
  const known = serverSentence(message);

  if (known) {
    return t(known.key, known.params);
  }

  if (message?.trim()) {
    return message.trim();
  }

  const fallback = DEFAULT_STATUS_KEYS[status];

  return fallback ? t(fallback) : t("error.generic");
}

