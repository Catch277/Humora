import type { ShiftSwap } from "@/lib/domain/entities/ShiftSwap";
import type { IShiftSwapRepository } from "@/lib/domain/repositories/IShiftSwapRepository";
import { assertUuid } from "@/lib/usecases/shiftWorkflowInput";

export type RespondShiftSwapCommand = { swapId: string; accept: boolean };

/** Step 2: the colleague accepts (the manager decides next) or declines (it ends). */
export class RespondShiftSwapUseCase {
  constructor(private readonly repository: IShiftSwapRepository) {}

  execute(command: RespondShiftSwapCommand): Promise<ShiftSwap> {
    assertUuid(command.swapId, "The swap id");

    return this.repository.respond(command.swapId, command.accept);
  }
}
