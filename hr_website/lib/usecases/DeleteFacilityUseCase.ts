import { FacilityNotFoundError } from "@/lib/domain/errors/FacilityNotFoundError";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";
import type { IFacilityRepository } from "@/lib/domain/repositories/IFacilityRepository";
import {
  assertBranchManagedBy,
  type BranchCaller,
} from "@/lib/usecases/branchScope";

export class DeleteFacilityUseCase {
  constructor(
    private readonly facilityRepository: IFacilityRepository,
    private readonly branchRepository: IBranchRepository,
  ) {}

  async execute(id: string, caller: BranchCaller): Promise<void> {
    const existing = await this.facilityRepository.findById(id);

    if (!existing) {
      throw new FacilityNotFoundError();
    }

    // SCRUM-61: a manager only retires equipment of the branch they head.
    await assertBranchManagedBy(
      this.branchRepository,
      existing.branch_id,
      caller,
    );

    await this.facilityRepository.delete(id);
  }
}
