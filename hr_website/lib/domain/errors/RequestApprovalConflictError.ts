/**
 * Approving the đơn was refused by the database because the swap it describes can no longer be applied
 * (`requests_apply_approved_effects`, SQLSTATE `23P04`, SCRUM-83).
 *
 * The schedule moved while the đơn waited: the requester no longer holds that ca, the ca has already
 * ended, somebody already clocked in for it, the colleague has left or changed branch, or the colleague
 * took another ca that overlaps. The trigger's own sentence is passed through because it already names
 * the ca, the day and the colleague, in Vietnamese — and because the whole statement rolled back, so the
 * đơn is still `PENDING` and the manager reads why instead of losing the request.
 */
export class RequestApprovalConflictError extends Error {
  constructor(
    message = "Không thể duyệt đơn: lịch làm việc đã thay đổi kể từ khi đơn được gửi.",
  ) {
    super(message);
    this.name = "RequestApprovalConflictError";
  }
}
