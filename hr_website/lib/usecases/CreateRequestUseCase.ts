import {
  MAX_REQUEST_CONTENT_LENGTH,
  MAX_REQUEST_TITLE_LENGTH,
  type CreateRequestInput,
  type RequestEntity,
} from "@/lib/domain/entities/RequestEntity";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import { RequestBranchForbiddenError } from "@/lib/domain/errors/RequestBranchForbiddenError";
import { RequestBranchNotAssignedError } from "@/lib/domain/errors/RequestBranchNotAssignedError";
import { RequestInputError } from "@/lib/domain/errors/RequestInputError";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";
import type { IRequestRepository } from "@/lib/domain/repositories/IRequestRepository";
import { isManagerRole } from "@/lib/domain/roles";
import { assertBranchManagedBy } from "@/lib/usecases/branchScope";

/**
 * The caller as the route handler knows it: who files, their role and the branch they belong to
 * (SCRUM-63). All three come from the session — the body never names the requester.
 */
export type CreateRequestUseCaseInput = CreateRequestInput & {
  requesterId: string;
  requesterRole: string;
  /** `users.branch_id`; `null` means the account belongs to no branch yet. */
  requesterBranchId: string | null;
};

export class CreateRequestUseCase {
  constructor(
    private readonly requestRepository: IRequestRepository,
    private readonly branchRepository: IBranchRepository,
  ) {}

  async execute(input: CreateRequestUseCaseInput): Promise<RequestEntity> {
    const title = input.title.trim();
    const content = input.content?.trim() ?? "";

    if (!title || title.length > MAX_REQUEST_TITLE_LENGTH) {
      throw new RequestInputError(
        `title must be a non-empty string of at most ${MAX_REQUEST_TITLE_LENGTH} characters.`,
      );
    }

    if (content.length > MAX_REQUEST_CONTENT_LENGTH) {
      throw new RequestInputError(
        `content must be at most ${MAX_REQUEST_CONTENT_LENGTH} characters.`,
      );
    }

    // SCRUM-63: a đơn belongs to one branch, and the caller may only name a branch they actually work
    // in or run. An employee works inside the branch they belong to, and an account that belongs to no
    // branch cannot file at all; a manager files for a branch they *head* — otherwise a chi nhánh
    // trưởng could open a đơn against somebody else's roster, where nobody but the owner could decide
    // it. `assertBranchManagedBy` answers `403` (another branch) or `404` (unknown) instead of letting
    // RLS match no row, which the caller would read as "not found".
    if (isManagerRole(input.requesterRole)) {
      await assertBranchManagedBy(this.branchRepository, input.branchId, {
        userId: input.requesterId,
        role: input.requesterRole,
      });
    } else {
      if (input.requesterBranchId === null) {
        throw new RequestBranchNotAssignedError();
      }

      if (input.branchId !== input.requesterBranchId) {
        throw new RequestBranchForbiddenError();
      }
    }

    // A request belongs to a branch, and the branch list is organization-scoped (SCRUM-60), so a
    // branch this caller cannot see — including another tenant's — is simply unknown here.
    const branch = await this.branchRepository.findById(input.branchId);

    if (!branch) {
      throw new BranchNotFoundError();
    }

    return this.requestRepository.create({
      branchId: input.branchId,
      requestType: input.requestType,
      title,
      // A blank note is an absent note, never an empty string in the column.
      content: content || null,
      userId: input.requesterId,
    });
  }
}
