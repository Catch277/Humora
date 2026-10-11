/**
 * The Edge Function refused the new account because the email address is already in use.
 *
 * It answers `409` for two unrelated conflicts and the owner's next step is different in each, so the
 * sentence the function sent decides the message — the "read the body, not the status" pattern the
 * join flow already uses for its `403`s. That coupling is contractual on both sides: the service
 * forwards the function's sentence, and `app/organization/page.tsx` matches `MEMBER_CONFLICT_MARKER`
 * to pick its Vietnamese copy, so reword the marker here and there together. Never write the marker in
 * a sentence that does not mean "already in the organization": an address merely having its own login
 * is *not* a membership, and reusing the phrase made every `409` on `/organization` read as one.
 */
export const MEMBER_CONFLICT_MARKER = "already a member of the organization";

/** Used when the function answered `409` without a sentence we know (a changed deployment). */
const UNRECOGNISED_CONFLICT_MESSAGE =
  "The email address is already in use, so a new account cannot be created for it.";

export class StaffAccountEmailTakenError extends Error {
  constructor(serverMessage?: string) {
    super(serverMessage?.trim() || UNRECOGNISED_CONFLICT_MESSAGE);
    this.name = "StaffAccountEmailTakenError";
  }
}
