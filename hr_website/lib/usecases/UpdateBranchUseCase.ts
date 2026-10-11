import type { Branch, UpdateBranchInput } from "@/lib/domain/entities/Branch";
import { BranchForbiddenError } from "@/lib/domain/errors/BranchForbiddenError";
import { BranchManagerChangeForbiddenError } from "@/lib/domain/errors/BranchManagerChangeForbiddenError";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";
import type { IUserRepository } from "@/lib/domain/repositories/IUserRepository";
import { isOwnerRole } from "@/lib/domain/roles";
import { normalizeBranchWriteInput } from "@/lib/usecases/branchInput";
import { assertBranchManagerExists } from "@/lib/usecases/branchManager";

/** The caller as the route handler knows it, always from the session and never from the body. */
export type UpdateBranchCaller = {
  userId: string;
  role: string;
};

export class UpdateBranchUseCase {
  constructor(
    private readonly branchRepository: IBranchRepository,
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(
    id: string,
    input: UpdateBranchInput,
    caller: UpdateBranchCaller,
  ): Promise<Branch> {
    // The current row decides both rules below, so it is read once, before anything is written.
    const current = await this.branchRepository.findById(id);

    if (!current) {
      throw new BranchNotFoundError();
    }

    const callerIsOwner = isOwnerRole(caller.role);

    // SCRUM-61: the owner edits any branch of the organization; a manager only the branch they head.
    if (!callerIsOwner && current.manager_id !== caller.userId) {
      throw new BranchForbiddenError();
    }

    // Who heads a branch is what grants that manager their scope, so handing it on (or taking a
    // second one) stays an owner action. `branches_guard_manager_change` repeats the rule in the
    // database, which is why this cannot be a silent override of the field.
    if (!callerIsOwner && input.managerId !== current.manager_id) {
      throw new BranchManagerChangeForbiddenError();
    }

    // The manager can be cleared by sending null, but never set to an account the caller cannot see.
    await assertBranchManagerExists(this.userRepository, input.managerId);

    return this.branchRepository.update(id, normalizeBranchWriteInput(input));
  }
}

