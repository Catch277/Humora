import type {
  CreateShiftRegistrationInput,
  ShiftRegistration,
} from "@/lib/domain/entities/ShiftRegistration";
import { ShiftWorkflowInputError } from "@/lib/domain/errors/ShiftWorkflowInputError";
import type { IShiftRegistrationRepository } from "@/lib/domain/repositories/IShiftRegistrationRepository";
import type { IShiftRepository } from "@/lib/domain/repositories/IShiftRepository";
import { getShiftWindow } from "@/lib/usecases/attendanceClock";
import {
  assertDate,
  assertNotInThePast,
  assertUuid,
  normalizeShiftNote,
} from "@/lib/usecases/shiftWorkflowInput";

export type CreateShiftRegistrationCommand = CreateShiftRegistrationInput & {
  callerId: string;
  /** `users.branch_id` of the caller; an account with no branch has nowhere to work. */
  callerBranchId: string | null;
};

/**
 * Đăng ký ca (SCRUM-23). The employee, the branch and the PENDING status are not the client's to
 * choose: the first two come from the session, the third is fixed. The shift must be a real working
 * template that belongs to the caller's branch (or to every branch).
 */
export class CreateShiftRegistrationUseCase {
  constructor(
    private readonly registrationRepository: IShiftRegistrationRepository,
    private readonly shiftRepository: IShiftRepository,
  ) {}

  async execute(
    command: CreateShiftRegistrationCommand,
    now: Date = new Date(),
  ): Promise<ShiftRegistration> {
    if (!command.callerBranchId) {
      throw new ShiftWorkflowInputError(
        "Your account is not assigned to a branch, so it cannot register for shifts.",
      );
    }

    assertUuid(command.shiftId, "shift_id");
    assertDate(command.workDate, "work_date");
    assertNotInThePast(command.workDate, now);
    const note = normalizeShiftNote(command.note, "note");

    const shift = await this.shiftRepository.findById(command.shiftId);

    if (
      !shift ||
      (shift.branch_id !== null && shift.branch_id !== command.callerBranchId)
    ) {
      throw new ShiftWorkflowInputError("The shift does not exist.");
    }

    if (!getShiftWindow(command.workDate, shift)) {
      throw new ShiftWorkflowInputError(
        "This shift has no working hours, so it cannot be registered.",
      );
    }

    return this.registrationRepository.create({
      shiftId: command.shiftId,
      workDate: command.workDate,
      note,
      employeeId: command.callerId,
      branchId: command.callerBranchId,
    });
  }
}
