/**
 * Approving the đơn was refused because the colleague named in a "Đổi ca" đơn cannot take the ca
 * (SCRUM-82/83).
 *
 * It is the answer of the picker's own rule: `eligible_swap_targets()` offers only colleagues of the
 * caller's branch who are free in that ca, so this error means the body named somebody the list does not
 * contain — an account of another branch, somebody who has left, the caller themselves, or somebody who
 * took an overlapping ca between the list being loaded and the đơn being filed. `409` because the request
 * itself is well-formed; it is the roster that moved, so the screen reloads the list.
 */
export class RequestSwapTargetNotFreeError extends Error {
  constructor(
    message = "Đồng nghiệp được chọn không còn rảnh trong ca này. Vui lòng chọn lại người nhận ca.",
  ) {
    super(message);
    this.name = "RequestSwapTargetNotFreeError";
  }
}
