/**
 * The database refused a **new** assignment because the ca's working time had already passed
 * (`shift_assignments_block_past`, SCRUM-81).
 *
 * The app repeats that rule before the insert (`isShiftAlreadyOver`, so the caller reads a sentence naming
 * the ca, its date and its end hour), and this is the backstop for the writers that rule cannot see: the
 * approval RPC `review_shift_registration()`, the dashboard, and any client that writes
 * `shift_assignments` directly. Postgres' own message is passed through because it already carries those
 * details, in Vietnamese, from the trigger.
 */
export class PastShiftAssignmentError extends Error {
  constructor(
    message = "Ca này đã kết thúc nên không thể xếp cho nhân viên nữa.",
  ) {
    super(message);
    this.name = "PastShiftAssignmentError";
  }
}
