import { ShiftAssignmentNotFoundError } from "@/lib/domain/errors/ShiftAssignmentNotFoundError";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";
import type { IShiftAssignmentRepository } from "@/lib/domain/repositories/IShiftAssignmentRepository";
import {
  assertBranchManagedBy,
  type BranchCaller,
} from "@/lib/usecases/branchScope";

export class DeleteShiftAssignmentUseCase {
  constructor(
    private readonly assignmentRepository: IShiftAssignmentRepository,
    private readonly branchRepository: IBranchRepository,
  ) {}

  async execute(id: string, caller: BranchCaller): Promise<void> {
    const existing = await this.assignmentRepository.findById(id);

    if (!existing) {
      throw new ShiftAssignmentNotFoundError();
    }

    // SCRUM-61: a manager only removes shifts from the branch they head.
    await assertBranchManagedBy(
      this.branchRepository,
      existing.branch_id,
      caller,
    );

    await this.assignmentRepository.delete(id);
  }
}
