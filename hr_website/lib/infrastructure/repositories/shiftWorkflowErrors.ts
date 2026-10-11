import { ShiftWorkflowConflictError } from "@/lib/domain/errors/ShiftWorkflowConflictError";
import { ShiftWorkflowForbiddenError } from "@/lib/domain/errors/ShiftWorkflowForbiddenError";
import { ShiftWorkflowInputError } from "@/lib/domain/errors/ShiftWorkflowInputError";
import { ShiftWorkflowStateError } from "@/lib/domain/errors/ShiftWorkflowStateError";

type PostgrestLikeError = { code?: string; message: string };

/**
 * Turns what Postgres / PostgREST answered into the domain's own errors. The codes are the ones
 * raised by `SCRUM-23_shift_registration_swap.sql`:
 *
 *   P0002 not found          42501 not allowed         22023 wrong state / bad input
 *   23P01 clashes with the schedule                    23505 duplicate (unique index)
 *   23503 a referenced row (shift, branch) does not exist
 *
 * `notFound` is supplied by the caller because "not found" means a different resource for each
 * repository. Anything unrecognised becomes a plain `Error` that the route logs and answers `500`.
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
      throw new ShiftWorkflowForbiddenError(error.message);
    case "22023":
      throw new ShiftWorkflowStateError(error.message);
    case "23P01":
    case "23505":
      throw new ShiftWorkflowConflictError(error.message);
    case "23503":
      throw new ShiftWorkflowInputError(
        "The shift or the branch in the request does not exist.",
      );
    default:
      throw new Error(`Unable to ${action}: ${error.message}`);
  }
}
