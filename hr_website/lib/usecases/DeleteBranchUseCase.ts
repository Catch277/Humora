import { isBranchEmpty } from "@/lib/domain/entities/Branch";
import { BranchNotEmptyError } from "@/lib/domain/errors/BranchNotEmptyError";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";

/**
 * Removes one branch (SCRUM-61). The route gates it with `branch:manage`, so only the organization's
 * OWNER reaches this use case — a chi nhánh trưởng does not delete the branch they manage, they run it.
 *
 * The branch has to be empty first: `attendance`, `shift_assignments` and `facilities` are
 * `on delete cascade`, so a delete would take that history with it, and `daily_revenue.branch_id` has
 * no foreign key at all, so its rows would be left orphaned. Instead of cascading, the caller gets the
 * counts and moves or removes them first; `branches_guard_delete` repeats the same check in the
 * database for a write that bypasses this use case.
 */
export class DeleteBranchUseCase {
  constructor(private readonly branchRepository: IBranchRepository) {}

  async execute(id: string): Promise<void> {
    const branch = await this.branchRepository.findById(id);

    if (!branch) {
      throw new BranchNotFoundError();
    }

    const dependents = await this.branchRepository.countDependents(id);

    if (!isBranchEmpty(dependents)) {
      throw new BranchNotEmptyError(dependents);
    }

    await this.branchRepository.delete(id);
  }
}
