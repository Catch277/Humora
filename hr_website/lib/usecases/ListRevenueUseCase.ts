import type { RevenueRecord } from "@/lib/domain/entities/RevenueRecord";
import type { IRevenueRepository } from "@/lib/domain/repositories/IRevenueRepository";
import { getBusinessDayRange } from "@/lib/usecases/businessDay";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 31;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export type ListRevenueInput = {
  branchId?: string;
  /** How many business days back to include, counting today (1..31, default 7). */
  days?: number;
  /** true = closed records only, false = still open, undefined = both. */
  isClosed?: boolean;
};

/**
 * The Doanh thu screen needs the records themselves — what was declared at opening, whether the
 * shift was closed and by whom. `/api/revenue/report` answers aggregates, so this is its row-level
 * sibling.
 *
 * The window is counted in Asia/Bangkok business days: `days = 1` is today, `days = 7` (the default)
 * starts at local midnight six days ago. UTC+7 has no DST, so shifting by whole days is exact.
 */
export class ListRevenueUseCase {
  constructor(
    private readonly revenueRepository: IRevenueRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: ListRevenueInput): Promise<RevenueRecord[]> {
    const days = input.days ?? DEFAULT_DAYS;

    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
      throw new Error(`days must be an integer between 1 and ${MAX_DAYS}.`);
    }

    const { start, end } = getBusinessDayRange(this.now());
    const startAt = new Date(start.getTime() - (days - 1) * MILLISECONDS_PER_DAY);

    return this.revenueRepository.findAll({
      branchId: input.branchId,
      startAt,
      endAt: end,
      isClosed: input.isClosed,
    });
  }
}