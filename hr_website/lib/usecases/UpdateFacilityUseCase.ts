import {
  FACILITY_ASSET_CODE_PATTERN,
  type Facility,
  type UpdateFacilityInput,
} from "@/lib/domain/entities/Facility";
import type { Branch } from "@/lib/domain/entities/Branch";
import { FacilityNotFoundError } from "@/lib/domain/errors/FacilityNotFoundError";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";
import type { IFacilityRepository } from "@/lib/domain/repositories/IFacilityRepository";
import { assertBranchManagedBy } from "@/lib/usecases/branchScope";
import {
  branchAssetToken,
  nextFacilityAssetCode,
} from "@/lib/usecases/facilityAssetCode";
import { normalizeFacilityWriteInput } from "@/lib/usecases/facilityInput";

/** The caller as the route handler knows it, always from the session and never from the body. */
export type UpdateFacilityUseCaseInput = UpdateFacilityInput & {
  callerId: string;
  callerRole: string;
};

/**
 * Replaces the editable fields of one facility (SCRUM-45).
 *
 * The asset tag (SCRUM-67) is the branch's, not the form's: a stored code is kept only while it is still
 * the one this branch would produce — an empty value (the column stayed nullable), a legacy
 * `DA_LAT-0001`/serial from before the field became read-only, or a move to another branch all make the
 * use case generate a fresh tag for the branch the row ends up in. That is also why the branch picker of
 * the modal is the only control that can change a code: the tag names the branch.
 */
export class UpdateFacilityUseCase {
  constructor(
    private readonly facilityRepository: IFacilityRepository,
    private readonly branchRepository: IBranchRepository,
  ) {}

  async execute(
    id: string,
    input: UpdateFacilityUseCaseInput,
  ): Promise<Facility> {
    const normalized = normalizeFacilityWriteInput(input);

    // The stored row says which branch the caller has to manage (SCRUM-61).
    const existing = await this.facilityRepository.findById(id);

    if (!existing) {
      throw new FacilityNotFoundError();
    }

    const caller = { userId: input.callerId, role: input.callerRole };

    // The guard returns the branch it validated, which is the token source when the row stays where it is.
    const currentBranch = await assertBranchManagedBy(
      this.branchRepository,
      existing.branch_id,
      caller,
    );

    // Moving equipment to another branch is the same rule from the other side, and the `with check`
    // half of `facilities_update_managers` refuses it in the database too.
    let destination: Branch | null = null;

    if (normalized.branchId !== existing.branch_id) {
      destination = await assertBranchManagedBy(
        this.branchRepository,
        normalized.branchId,
        caller,
      );
    }

    const moved = normalized.branchId !== existing.branch_id;
    let code = existing.code;

    // SCRUM-67: the tag is generated, so a stored one survives only while it still matches what the
    // generator produces. Anything else is replaced here instead of being left for `facilities_code_check`
    // to refuse — `not valid` exempts the old rows from the scan, but an UPDATE would still have to write
    // a value the constraint accepts.
    if (!code || moved || !FACILITY_ASSET_CODE_PATTERN.test(code)) {
      code = nextFacilityAssetCode(
        branchAssetToken(destination ?? currentBranch),
        await this.facilityRepository.listCodes(),
      );
    }

    return this.facilityRepository.update(id, { ...normalized, code });
  }
}
