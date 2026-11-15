import type {
  RevenueReportPeriod,
  RevenueReportPoint,
  RevenueReportResult,
  RevenueReportSummary,
} from "@/lib/domain/entities/RevenueReport";
import type { IRevenueReportRepository } from "@/lib/domain/repositories/IRevenueReportRepository";
import {
  formatDateParts,
  getBangkokDateParts,
  getReportRange,
  parseReportDate,
} from "@/lib/usecases/reportRange";

export type GetRevenueReportInput = {
  branchId?: string;
  period: RevenueReportPeriod;
  date?: string;
};

function summarise(points: RevenueReportPoint[]): RevenueReportSummary {
  return points.reduce<RevenueReportSummary>(
    (summary, point) => ({
      total_open_amount: summary.total_open_amount + point.total_open_amount,
      total_close_amount: summary.total_close_amount + point.total_close_amount,
      total_revenue_amount:
        summary.total_revenue_amount + point.total_revenue_amount,
      record_count: summary.record_count + point.record_count,
    }),
    {
      total_open_amount: 0,
      total_close_amount: 0,
      total_revenue_amount: 0,
      record_count: 0,
    },
  );
}

export class GetRevenueReportUseCase {
  constructor(
    private readonly revenueReportRepository: IRevenueReportRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: GetRevenueReportInput): Promise<RevenueReportResult> {
    const anchor = parseReportDate(input.date, this.now());
    const currentRange = getReportRange(input.period, anchor);
    const previousAnchor = getBangkokDateParts(
      new Date(currentRange.start.getTime() - 1),
    );
    const previousRange = getReportRange(input.period, previousAnchor);

    const [series, previousSeries] = await Promise.all([
      this.revenueReportRepository.getAggregatedReport({
        branchId: input.branchId,
        startAt: currentRange.start,
        endAt: currentRange.end,
        bucket: currentRange.bucket,
      }),
      this.revenueReportRepository.getAggregatedReport({
        branchId: input.branchId,
        startAt: previousRange.start,
        endAt: previousRange.end,
        bucket: previousRange.bucket,
      }),
    ]);

    const summary = summarise(series);
    const previousSummary = summarise(previousSeries);
    const difference =
      summary.total_revenue_amount - previousSummary.total_revenue_amount;

    return {
      period: input.period,
      date: formatDateParts(anchor),
      range: {
        start_at: currentRange.start.toISOString(),
        end_at: currentRange.end.toISOString(),
      },
      summary,
      comparison: {
        previous_total_revenue_amount:
          previousSummary.total_revenue_amount,
        difference,
        percentage_change:
          previousSummary.total_revenue_amount === 0
            ? null
            : (difference / previousSummary.total_revenue_amount) * 100,
      },
      series,
    };
  }
}
