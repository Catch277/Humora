import type { Branch } from "@/lib/domain/entities/Branch";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";

export class ListBranchesUseCase {
  constructor(private readonly branchRepository: IBranchRepository) {}

  async execute(): Promise<Branch[]> {
    return this.branchRepository.findAll();
  }
}
