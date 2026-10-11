import type {
  RevenueRecord,
  UpdateCloseRevenueInput,
} from "@/lib/domain/entities/RevenueRecord";
import { OpenRevenueNotFoundError } from "@/lib/domain/errors/OpenRevenueNotFoundError";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";
import type { IRevenueRepository } from "@/lib/domain/repositories/IRevenueRepository";
import { assertBranchManagedBy } from "@/lib/usecases/branchScope";
import { getBusinessDayRange } from "@/lib/usecases/businessDay";

export type DeclareCloseRevenueInput = UpdateCloseRevenueInput & {
  branchId: string;
  /** The caller's role, from the session — the branch rule needs it (SCRUM-61). */
  callerRole: string;
};

export type DeclareCloseRevenueResult = {
  revenue: RevenueRecord;
  revenue_difference: number;
};

export class DeclareCloseRevenueUseCase {
  constructor(
    private readonly revenueRepository: IRevenueRepository,
    private readonly branchRepository: IBranchRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    input: DeclareCloseRevenueInput,
  ): Promise<DeclareCloseRevenueResult> {
    if (!Number.isFinite(input.closeAmount) || input.closeAmount < 0) {
      throw new Error("close_amount must be a non-negative number.");
    }

    // SCRUM-61: closing a day is a branch action, so a manager may only close their own branch.
    await assertBranchManagedBy(this.branchRepository, input.branchId, {
      userId: input.closedBy,
      role: input.callerRole,
    });

    const { start, end } = getBusinessDayRange(this.now());
    const openRevenue = await this.revenueRepository.findByBranchInPeriod(
      input.branchId,
      start,
      end,
    );

    if (!openRevenue) {
      throw new OpenRevenueNotFoundError();
    }

    const revenue = await this.revenueRepository.updateCloseRevenue(
      openRevenue.id,
      input,
    );

    return {
      revenue,
      revenue_difference: input.closeAmount - Number(openRevenue.open_amount),
    };
  }
}
