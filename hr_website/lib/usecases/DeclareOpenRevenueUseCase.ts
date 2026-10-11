import type {
  CreateRevenueRecordInput,
  RevenueRecord,
} from "@/lib/domain/entities/RevenueRecord";
import { RevenueAlreadyDeclaredError } from "@/lib/domain/errors/RevenueAlreadyDeclaredError";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";
import type { IRevenueRepository } from "@/lib/domain/repositories/IRevenueRepository";
import { assertBranchManagedBy } from "@/lib/usecases/branchScope";
import { getBusinessDayRange } from "@/lib/usecases/businessDay";

export type DeclareOpenRevenueInput = CreateRevenueRecordInput & {
  /** The caller's role, from the session — the branch rule needs it (SCRUM-61). */
  callerRole: string;
};

export class DeclareOpenRevenueUseCase {
  constructor(
    private readonly revenueRepository: IRevenueRepository,
    private readonly branchRepository: IBranchRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: DeclareOpenRevenueInput): Promise<RevenueRecord> {
    if (!Number.isFinite(input.openAmount) || input.openAmount < 0) {
      throw new Error("open_amount must be a non-negative number.");
    }

    // SCRUM-61: opening a day is a branch action, so a manager may only declare their own branch.
    await assertBranchManagedBy(this.branchRepository, input.branchId, {
      userId: input.createdBy,
      role: input.callerRole,
    });

    const { start, end } = getBusinessDayRange(this.now());
    const existingRecord = await this.revenueRepository.findByBranchInPeriod(
      input.branchId,
      start,
      end,
    );

    if (existingRecord) {
      throw new RevenueAlreadyDeclaredError();
    }

    return this.revenueRepository.create(input);
  }
}
