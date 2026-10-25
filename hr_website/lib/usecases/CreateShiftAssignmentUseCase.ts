import type {
  CreateShiftAssignmentInput,
  ShiftAssignment,
} from "@/lib/domain/entities/Shift";
import { ShiftAlreadyEndedError } from "@/lib/domain/errors/ShiftAlreadyEndedError";
import { ShiftNotFoundError } from "@/lib/domain/errors/ShiftNotFoundError";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";
import type { IShiftAssignmentRepository } from "@/lib/domain/repositories/IShiftAssignmentRepository";
import type { IShiftRepository } from "@/lib/domain/repositories/IShiftRepository";
import { assertBranchManagedBy } from "@/lib/usecases/branchScope";
import { normalizeShiftAssignmentWriteInput } from "@/lib/usecases/shiftAssignmentInput";
import { assertNoOverlappingShift } from "@/lib/usecases/shiftOverlap";
import { isShiftAlreadyOver } from "@/lib/usecases/shiftWindow";

/** The caller as the route handler knows it, always from the session and never from the body. */
export type CreateShiftAssignmentUseCaseInput = CreateShiftAssignmentInput & {
  callerId: string;
  callerRole: string;
};

export class CreateShiftAssignmentUseCase {
  constructor(
    private readonly assignmentRepository: IShiftAssignmentRepository,
    private readonly shiftRepository: IShiftRepository,
    private readonly branchRepository: IBranchRepository,
    // Injectable so "the ca is already over" can be verified without waiting for the clock.
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    input: CreateShiftAssignmentUseCaseInput,
  ): Promise<ShiftAssignment> {
    const normalized = normalizeShiftAssignmentWriteInput(input);

    // SCRUM-61: the schedule belongs to a branch, so a manager may only write their own.
    await assertBranchManagedBy(this.branchRepository, normalized.branchId, {
      userId: input.callerId,
      role: input.callerRole,
    });

    const shift = await this.shiftRepository.findById(normalized.shiftId);

    if (!shift) {
      throw new ShiftNotFoundError();
    }

    // Only a work assignment is judged, so a day off skips both checks: nothing is worked on a `LEAVE`
    // row, and "they were off that day, log it" has to stay writable after the fact.
    if (normalized.status === "SCHEDULED") {
      if (isShiftAlreadyOver(this.now(), normalized.workDate, shift)) {
        throw new ShiftAlreadyEndedError(
          shift.name,
          shift.end_time ?? "",
          normalized.workDate,
        );
      }

      await assertNoOverlappingShift(this.assignmentRepository, {
        employeeId: normalized.employeeId,
        workDate: normalized.workDate,
        shift,
      });
    }

    return this.assignmentRepository.create(normalized);
  }
}
