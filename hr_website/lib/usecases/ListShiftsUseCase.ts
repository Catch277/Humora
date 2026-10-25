import type { Shift } from "@/lib/domain/entities/Shift";
import type { IShiftRepository } from "@/lib/domain/repositories/IShiftRepository";

export class ListShiftsUseCase {
  constructor(private readonly shiftRepository: IShiftRepository) {}

  /**
   * The catalogue this endpoint answers is the one that can actually be scheduled: the "Ca làm việc"
   * picker and the week table on `/schedules`, and the manager's ca picker on `/check-in`.
   *
   * Two templates are deliberately left out:
   * - a retired one (SCRUM-85: legacy `Ca tối` 14:00–23:00). Its row still exists because a past
   *   assignment or registration points at it, so the week that already holds one keeps rendering it
   *   through the embedded template — but it must never be offered again;
   * - a zero-length one (SCRUM-86: `Nghỉ` 00:00–00:00). It is a day off, not a time of day: it can be
   *   neither scheduled nor handed over, and an approved "Nghỉ phép" now marks the ca the employee holds
   *   instead of writing a row on it.
   */
  async execute(): Promise<Shift[]> {
    const shifts = await this.shiftRepository.findAll();

    return shifts.filter(
      (shift) =>
        shift.is_active &&
        shift.start_time !== null &&
        shift.end_time !== null &&
        shift.start_time !== shift.end_time,
    );
  }
}
