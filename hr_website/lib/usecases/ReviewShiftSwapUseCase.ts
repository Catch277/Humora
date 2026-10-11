import type { ShiftSwap } from "@/lib/domain/entities/ShiftSwap";
import type { IShiftSwapRepository } from "@/lib/domain/repositories/IShiftSwapRepository";
import {
  assertManagerRole,
  assertUuid,
  normalizeDecision,
} from "@/lib/usecases/shiftWorkflowInput";

export type ReviewShiftSwapCommand = {
  swapId: string;
  approve: boolean;
  rejectReason: string | null;
  callerRole: string;
};

/**
 * Step 3: a manager decides a swap the colleague already accepted. Approving moves the shift to the
 * colleague inside the database function, after re-checking that nothing changed in the meantime.
 */
export class ReviewShiftSwapUseCase {
  constructor(private readonly repository: IShiftSwapRepository) {}

  execute(command: ReviewShiftSwapCommand): Promise<ShiftSwap> {
    assertManagerRole(command.callerRole);
    assertUuid(command.swapId, "The swap id");

    return this.repository.review(command.swapId, {
      approve: command.approve,
      rejectReason: normalizeDecision(command.approve, command.rejectReason),
    });
  }
}
