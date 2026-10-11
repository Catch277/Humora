import type {
  RequestEntity,
  ReviewRequestInput,
} from "@/lib/domain/entities/RequestEntity";
import { RequestNotFoundError } from "@/lib/domain/errors/RequestNotFoundError";
import { RequestReviewForbiddenError } from "@/lib/domain/errors/RequestReviewForbiddenError";
import { RequestSelfReviewError } from "@/lib/domain/errors/RequestSelfReviewError";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";
import type { IRequestRepository } from "@/lib/domain/repositories/IRequestRepository";
import { isManagerRole, isOwnerRole } from "@/lib/domain/roles";
import { assertBranchManagedBy } from "@/lib/usecases/branchScope";

export type ReviewRequestUseCaseInput = ReviewRequestInput & {
  requestId: string;
  approverRole: string;
};

export class ReviewRequestUseCase {
  constructor(
    private readonly requestRepository: IRequestRepository,
    private readonly branchRepository: IBranchRepository,
  ) {}

  async execute(input: ReviewRequestUseCaseInput): Promise<RequestEntity> {
    if (!isManagerRole(input.approverRole)) {
      throw new RequestReviewForbiddenError();
    }

    if (input.status === "REJECTED" && !input.rejectReason?.trim()) {
      throw new Error("reject_reason is required when rejecting a request.");
    }

    const request = await this.requestRepository.findById(input.requestId);

    if (!request) {
      throw new RequestNotFoundError();
    }

    // Nobody signs off on their own đơn (SCRUM-63): a branch head's own request is the organization
    // owner's decision. The owner is the exception — there is nobody above them, so an owner's own
    // request stays reviewable by them and would otherwise be stuck at `PENDING` forever. This is the
    // single place the rule lives; `/requests` hides the buttons for the same case.
    if (request.user_id === input.approverId && !isOwnerRole(input.approverRole)) {
      throw new RequestSelfReviewError();
    }

    // SCRUM-61: a request belongs to a branch, so a manager approves only their own branch's. A
    // request that lost its branch (`requests.branch_id` is `on delete set null`) has no head left,
    // so only the owner reviews it.
    await assertBranchManagedBy(this.branchRepository, request.branch_id, {
      userId: input.approverId,
      role: input.approverRole,
    });

    return this.requestRepository.review(input.requestId, input);
  }
}
