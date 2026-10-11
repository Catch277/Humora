import type { Shift } from "@/lib/domain/entities/Shift";
import type { IShiftRepository } from "@/lib/domain/repositories/IShiftRepository";

export class ListShiftsUseCase {
  constructor(private readonly shiftRepository: IShiftRepository) {}

  async execute(): Promise<Shift[]> {
    return this.shiftRepository.findAll();
  }
}
