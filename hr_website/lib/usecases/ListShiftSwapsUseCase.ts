import type { ShiftSwap, ShiftSwapFilters } from "@/lib/domain/entities/ShiftSwap";
import type { IShiftSwapRepository } from "@/lib/domain/repositories/IShiftSwapRepository";
import { MANAGER_ROLES, normalizeRole } from "@/lib/domain/roles";

export type ListShiftSwapsCommand = {
  filters: ShiftSwapFilters;
  callerId: string;
  callerRole: string;
};

/** A manager lists what they asked for; an employee only the swaps they sent or were asked to take. */
export class ListShiftSwapsUseCase {
  constructor(private readonly repository: IShiftSwapRepository) {}

  execute(command: ListShiftSwapsCommand): Promise<ShiftSwap[]> {
    if (MANAGER_ROLES.has(normalizeRole(command.callerRole))) {
      return this.repository.findAll(command.filters);
    }

    return this.repository.findAll({
      ...command.filters,
      involvingEmployeeId: command.callerId,
    });
  }
}
