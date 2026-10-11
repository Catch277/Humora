import type {
  ShiftAssignment,
  UpdateShiftAssignmentInput,
} from "@/lib/domain/entities/Shift";
import { ShiftAssignmentNotFoundError } from "@/lib/domain/errors/ShiftAssignmentNotFoundError";
import { ShiftNotFoundError } from "@/lib/domain/errors/ShiftNotFoundError";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";
import type { IShiftAssignmentRepository } from "@/lib/domain/repositories/IShiftAssignmentRepository";
import type { IShiftRepository } from "@/lib/domain/repositories/IShiftRepository";
import { assertBranchManagedBy } from "@/lib/usecases/branchScope";
import { normalizeShiftAssignmentWriteInput } from "@/lib/usecases/shiftAssignmentInput";
import { assertNoOverlappingShift } from "@/lib/usecases/shiftOverlap";

/** The caller as the route handler knows it, always from the session and never from the body. */
export type UpdateShiftAssignmentUseCaseInput = UpdateShiftAssignmentInput & {
  callerId: string;
  callerRole: string;
};

export class UpdateShiftAssignmentUseCase {
  constructor(
    private readonly assignmentRepository: IShiftAssignmentRepository,
    private readonly shiftRepository: IShiftRepository,
    private readonly branchRepository: IBranchRepository,
  ) {}

  async execute(
    id: string,
    input: UpdateShiftAssignmentUseCaseInput,
  ): Promise<ShiftAssignment> {
    const normalized = normalizeShiftAssignmentWriteInput(input);

    // The row as it stands says which branch the caller has to manage (SCRUM-61); without it a manager
    // could edit another branch's schedule just by naming its id.
    const existing = await this.assignmentRepository.findById(id);

    if (!existing) {
      throw new ShiftAssignmentNotFoundError();
    }

    const caller = { userId: input.callerId, role: input.callerRole };

    await assertBranchManagedBy(this.branchRepository, existing.branch_id, caller);

    // Moving an assignment *into* another branch is the same rule seen from the other side, and the
    // `with check` half of `shift_assignments_update_managers` refuses it in the database too.
    if (normalized.branchId !== existing.branch_id) {
      await assertBranchManagedBy(this.branchRepository, normalized.branchId, caller);
    }

    const shift = await this.shiftRepository.findById(normalized.shiftId);

    if (!shift) {
      throw new ShiftNotFoundError();
    }

    if (normalized.status === "SCHEDULED") {
      await assertNoOverlappingShift(this.assignmentRepository, {
        employeeId: normalized.employeeId,
        workDate: normalized.workDate,
        shift,
        ignoreAssignmentId: id,
      });
    }

    return this.assignmentRepository.update(id, normalized);
  }
}
