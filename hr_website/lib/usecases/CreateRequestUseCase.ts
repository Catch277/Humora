import {
  MAX_REQUEST_CONTENT_LENGTH,
  MAX_REQUEST_TITLE_LENGTH,
  requestNeedsSwapDetails,
  requestNeedsWorkDate,
  type CreateRequestInput,
  type RequestEntity,
} from "@/lib/domain/entities/RequestEntity";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import { RequestBranchForbiddenError } from "@/lib/domain/errors/RequestBranchForbiddenError";
import { RequestBranchNotAssignedError } from "@/lib/domain/errors/RequestBranchNotAssignedError";
import { RequestInputError } from "@/lib/domain/errors/RequestInputError";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";
import type { IRequestRepository } from "@/lib/domain/repositories/IRequestRepository";
import type { IShiftAssignmentRepository } from "@/lib/domain/repositories/IShiftAssignmentRepository";
import type { ISwapCandidateRepository } from "@/lib/domain/repositories/ISwapCandidateRepository";
import { isManagerRole } from "@/lib/domain/roles";
import { assertBranchManagedBy } from "@/lib/usecases/branchScope";
import {
  normalizeRequestDetails,
  requireEligibleSwapTarget,
  requireOwnShiftAssignment,
  requireOwnShiftOnDay,
  requireRequestWorkDate,
  requireSwapIds,
} from "@/lib/usecases/requestDetails";

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
    // SCRUM-82: a "Đổi ca" đơn has to name a ca the caller actually holds that day, so the schedule is
    // read through its own repository — RLS is what makes that read the caller's own rows.
    private readonly assignmentRepository: IShiftAssignmentRepository,
    // …and a colleague the picker offers. The eligibility rule lives in the database RPC, never here.
    private readonly candidateRepository: ISwapCandidateRepository,
    // Injectable so "the day is already past" / "the ca has already ended" can be verified without
    // waiting for the clock, like `CreateShiftAssignmentUseCase`.
    private readonly now: () => Date = () => new Date(),
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

    // SCRUM-82/83: the day the đơn is about, and — for "Đổi ca" — the ca and the colleague who takes it.
    // A type that acts on nothing stores none of the three, so a tampered body cannot smuggle a ca and a
    // colleague onto a "Nghỉ phép" đơn and have the approval trigger read them.
    const details = normalizeRequestDetails(input);
    let workDate: string | null = null;

    if (requestNeedsWorkDate(input.requestType)) {
      workDate = requireRequestWorkDate(details.workDate, input.requestType, this.now());
    }

    // SCRUM-86: a "Nghỉ phép" đơn covers the ca the employee actually holds that day, because that is
    // what the approval turns into `LEAVE`. A leave for a day nobody scheduled used to be accepted and the
    // approval had to write a row on the zero-length "Nghỉ" template, which `/schedules` no longer draws;
    // the caller now reads a sentence instead of a schedule entry nobody can act on.
    if (input.requestType === "Nghỉ phép" && workDate !== null) {
      await requireOwnShiftOnDay(this.assignmentRepository, {
        employeeId: input.requesterId,
        workDate,
      });
    }

    if (requestNeedsSwapDetails(input.requestType) && workDate !== null) {
      const { shiftId, targetEmployeeId } = requireSwapIds(
        details.shiftId,
        details.targetEmployeeId,
      );

      // The ca must be the caller's own and still ahead — the same two facts `POST /api/schedules`
      // checks before it writes one (SCRUM-81) — and the colleague must be one the picker offers, which
      // is `eligible_swap_targets()`, i.e. the same rule the approval re-checks.
      await requireOwnShiftAssignment(this.assignmentRepository, {
        employeeId: input.requesterId,
        workDate,
        shiftId,
        now: this.now(),
      });

      await requireEligibleSwapTarget(this.candidateRepository, {
        workDate,
        shiftId,
        targetEmployeeId,
      });
    }

    return this.requestRepository.create({
      branchId: input.branchId,
      requestType: input.requestType,
      title,
      // A blank note is an absent note, never an empty string in the column.
      content: content || null,
      workDate,
      shiftId: details.shiftId,
      targetEmployeeId: details.targetEmployeeId,
      userId: input.requesterId,
    });
  }
}
