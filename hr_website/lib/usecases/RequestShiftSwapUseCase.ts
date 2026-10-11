import type { RequestShiftSwapInput, ShiftSwap } from "@/lib/domain/entities/ShiftSwap";
import { ShiftWorkflowInputError } from "@/lib/domain/errors/ShiftWorkflowInputError";
import type { IShiftSwapRepository } from "@/lib/domain/repositories/IShiftSwapRepository";
import { assertUuid, normalizeShiftNote } from "@/lib/usecases/shiftWorkflowInput";

export type RequestShiftSwapCommand = RequestShiftSwapInput & { callerId: string };

/**
 * Chuyển ca (SCRUM-23), step 1: the owner of an assigned shift offers it to a colleague. That the
 * shift is the caller's, still ahead, has no attendance yet, and that the colleague is an active
 * employee of the same branch with a free slot are all checked by `request_shift_swap` in the
 * database, where the schedule can be read consistently.
 */
export class RequestShiftSwapUseCase {
  constructor(private readonly repository: IShiftSwapRepository) {}

  execute(command: RequestShiftSwapCommand): Promise<ShiftSwap> {
    assertUuid(command.assignmentId, "assignment_id");
    assertUuid(command.targetEmployeeId, "target_employee_id");

    if (command.targetEmployeeId === command.callerId) {
      throw new ShiftWorkflowInputError("You cannot hand a shift over to yourself.");
    }

    return this.repository.request({
      assignmentId: command.assignmentId,
      targetEmployeeId: command.targetEmployeeId,
      reason: normalizeShiftNote(command.reason, "reason"),
    });
  }
}
