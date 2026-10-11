import type {
  CreateFacilityInput,
  Facility,
} from "@/lib/domain/entities/Facility";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";
import type { IFacilityRepository } from "@/lib/domain/repositories/IFacilityRepository";
import { assertBranchManagedBy } from "@/lib/usecases/branchScope";
import {
  branchAssetToken,
  nextFacilityAssetCode,
} from "@/lib/usecases/facilityAssetCode";
import { normalizeFacilityWriteInput } from "@/lib/usecases/facilityInput";

/** The caller as the route handler knows it, always from the session and never from the body. */
export type CreateFacilityUseCaseInput = CreateFacilityInput & {
  callerId: string;
  callerRole: string;
};

/**
 * Registers one facility of a branch (SCRUM-45) and hands it its asset tag (SCRUM-67).
 *
 * SCRUM-61: the inventory belongs to a branch, so a manager may only add to one they head.
 * SCRUM-67: the tag is `{số chi nhánh}{viết tắt}-{số}`, e.g. `01HSVH-0001`, and it is generated here — the
 * request body carries no `code` at all — so the sequence stays authoritative on the server and a client
 * cannot influence it.
 */
export class CreateFacilityUseCase {
  constructor(
    private readonly facilityRepository: IFacilityRepository,
    private readonly branchRepository: IBranchRepository,
  ) {}

  async execute(input: CreateFacilityUseCaseInput): Promise<Facility> {
    // The guard returns the branch it validated: its number and its name are what the tag is built from.
    const branch = await assertBranchManagedBy(
      this.branchRepository,
      input.branchId,
      {
        userId: input.callerId,
        role: input.callerRole,
      },
    );

    const code = nextFacilityAssetCode(
      branchAssetToken(branch),
      await this.facilityRepository.listCodes(),
    );

    return this.facilityRepository.create(
      normalizeFacilityWriteInput({ ...input, code }),
    );
  }
}
