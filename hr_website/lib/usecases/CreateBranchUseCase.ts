import type { Branch, CreateBranchInput } from "@/lib/domain/entities/Branch";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";
import type { IUserRepository } from "@/lib/domain/repositories/IUserRepository";
import { normalizeBranchWriteInput } from "@/lib/usecases/branchInput";
import { assertBranchManagerExists } from "@/lib/usecases/branchManager";

export class CreateBranchUseCase {
  constructor(
    private readonly branchRepository: IBranchRepository,
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(input: CreateBranchInput): Promise<Branch> {
    // Checked before the write so an unknown manager answers with a typed error (400) instead of a
    // foreign-key failure, and so a manager from another organization is refused outright.
    await assertBranchManagerExists(this.userRepository, input.managerId);

    return this.branchRepository.create(normalizeBranchWriteInput(input));
  }
}
