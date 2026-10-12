/**
 * The Edge Function refused the new account because the email address is already in use.
 *
 * It answers `409` for two unrelated conflicts and the owner's next step is different in each, so the
 * sentence the function sent decides the message — the "read the body, not the status" pattern the
 * join flow already uses for its `403`s. That coupling is contractual on both sides: the service
 * forwards the function's sentence and `app/organization/page.tsx` asks `isMemberConflictMessage()`
 * which of the two conflicts it is, so reword the phrases here and there together.
 *
 * Both spellings are matched on purpose: the function answers Vietnamese from the revision that ships
 * with this app, while an *older deployment* still answers English. Dropping the English phrase would
 * make every "already a member" conflict read as "merely has an auth login" — a wrong instruction —
 * until the function is pasted into the dashboard again. Never add a phrase here that does not mean
 * "already in the organization": an address merely having its own login is *not* a membership.
 */
const MEMBER_CONFLICT_MARKERS = [
  "đã là thành viên của tổ chức",
  "already a member of the organization",
];

/** True when the function's `409` sentence says the address already belongs to the organization. */
export function isMemberConflictMessage(serverMessage: string | null | undefined): boolean {
  if (!serverMessage) {
    return false;
  }

  return MEMBER_CONFLICT_MARKERS.some((marker) => serverMessage.includes(marker));
}

/** Used when the function answered `409` without a sentence we know (a changed deployment). */
const UNRECOGNISED_CONFLICT_MESSAGE =
  "Email này đã được sử dụng nên không tạo được tài khoản mới.";

export class StaffAccountEmailTakenError extends Error {
  constructor(serverMessage?: string) {
    super(serverMessage?.trim() || UNRECOGNISED_CONFLICT_MESSAGE);
    this.name = "StaffAccountEmailTakenError";
  }
}


