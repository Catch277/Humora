/**
 * A branch head tried to decide their own đơn (SCRUM-63). Signing off on one's own request is not a
 * control — the organization's OWNER is the one role that may still review it, because nobody sits
 * above them; `ReviewRequestUseCase` is the only place that rule lives.
 */
export class RequestSelfReviewError extends Error {
  constructor() {
    super(
      "You cannot approve or reject your own request; the organization's owner decides it.",
    );
    this.name = "RequestSelfReviewError";
  }
}
