import type { ShiftSwap } from "@/lib/domain/entities/ShiftSwap";
import type { IShiftSwapRepository } from "@/lib/domain/repositories/IShiftSwapRepository";
import { assertUuid } from "@/lib/usecases/shiftWorkflowInput";

export type CancelShiftSwapCommand = { swapId: string };

/** The requester withdraws a swap while it is still open (PENDING or ACCEPTED). */
export class CancelShiftSwapUseCase {
  constructor(private readonly repository: IShiftSwapRepository) {}

  execute(command: CancelShiftSwapCommand): Promise<ShiftSwap> {
    assertUuid(command.swapId, "The swap id");

    return this.repository.cancel(command.swapId);
  }
}
