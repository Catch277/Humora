import { PastShiftAssignmentError } from "@/lib/domain/errors/PastShiftAssignmentError";
import { ShiftWorkflowConflictError } from "@/lib/domain/errors/ShiftWorkflowConflictError";
import { ShiftWorkflowForbiddenError } from "@/lib/domain/errors/ShiftWorkflowForbiddenError";
import { ShiftWorkflowInputError } from "@/lib/domain/errors/ShiftWorkflowInputError";
import { ShiftWorkflowStateError } from "@/lib/domain/errors/ShiftWorkflowStateError";
import { shiftWorkflowMessage } from "@/lib/domain/shiftWorkflowMessages";

type PostgrestLikeError = { code?: string; message: string };

/**
 * Turns what Postgres / PostgREST answered into the domain's own errors. The codes are the ones
 * raised by `SCRUM-23_shift_registration_swap.sql` and the table guards:
 *
 *   P0002 not found          42501 not allowed         22023 wrong state / bad input
 *   23P01 clashes with the schedule                    23505 duplicate (unique index)
 *   23503 a referenced row (shift, branch) does not exist
 *   23P02 the ca has already ended (`shift_assignments_block_past`, SCRUM-81) — what approving a
 *         registration for a past day now answers
 *
 * `notFound` is supplied by the caller because "not found" means a different resource for each
 * repository. Anything unrecognised becomes a plain `Error` that the route logs and answers `500`.
 *
 * The **class** decides the HTTP status; the **sentence** is passed through `shiftWorkflowMessage()` so a
 * caller reads Vietnamese (those SQL scripts raise English, and `/schedules` shows the text verbatim now
 * that it can review a registration). Translating here, not in a route, keeps both halves together:
 * no route matches on the wording.
 */
export function throwShiftWorkflowError(
  error: PostgrestLikeError,
  notFound: Error,
  action: string,
): never {
  switch (error.code) {
    case "P0002":
      throw notFound;
    case "42501":
      throw new ShiftWorkflowForbiddenError(shiftWorkflowMessage(error.message));
    case "22023":
      throw new ShiftWorkflowStateError(shiftWorkflowMessage(error.message));
    case "23P01":
      throw new ShiftWorkflowConflictError(shiftWorkflowMessage(error.message));
    case "23505":
      // A unique index only — Postgres' own text ("duplicate key value violates unique constraint …") is not
      // a sentence a caller should read, so the two conflicts it can mean are named instead.
      throw new ShiftWorkflowConflictError(
        "Ca làm việc này đã có trong lịch, hoặc bạn đã đăng ký ca này trong ngày đó rồi.",
      );
    case "23P02":
      // The trigger's sentence already names the ca, its date and its end hour.
      throw new PastShiftAssignmentError(error.message);
    case "23503":
      throw new ShiftWorkflowInputError(
        "Ca làm việc hoặc chi nhánh trong yêu cầu không tồn tại.",
      );
    default:
      throw new Error(`Unable to ${action}: ${error.message}`);
  }
}
