import type {
  RevenueReportPeriod,
  RevenueReportPoint,
  RevenueReportResult,
  RevenueReportSummary,
} from "@/lib/domain/entities/RevenueReport";
import type { IRevenueReportRepository } from "@/lib/domain/repositories/IRevenueReportRepository";

type DateParts = { year: number; month: number; day: number };

export type GetRevenueReportInput = {
  branchId?: string;
  period: RevenueReportPeriod;
  date?: string;
};

const BUSINESS_TIME_ZONE = "Asia/Bangkok";

function getBangkokDateParts(date: Date): DateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, Number(value)]),
  ) as Record<"year" | "month" | "day", number>;

  return values;
}

function toBangkokStart({ year, month, day }: DateParts): Date {
  // Asia/Bangkok is UTC+7 and does not observe daylight saving time.
  return new Date(Date.UTC(year, month - 1, day, -7));
}

function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function parseReportDate(value: string | undefined, now: Date): DateParts {
  if (!value) {
    return getBangkokDateParts(now);
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("date must use YYYY-MM-DD format.");
  }

  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  const calendarDate = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  );

  if (
    calendarDate.getUTCFullYear() !== parts.year ||
    calendarDate.getUTCMonth() !== parts.month - 1 ||
    calendarDate.getUTCDate() !== parts.day
  ) {
    throw new Error("date must be a valid calendar date.");
  }

  return parts;
}

function getRange(period: RevenueReportPeriod, anchor: DateParts) {
  if (period === "day") {
    const start = toBangkokStart(anchor);
    return { start, end: addCalendarDays(start, 1), bucket: "day" as const };
  }

  if (period === "week") {
    const anchorDate = new Date(
      Date.UTC(anchor.year, anchor.month - 1, anchor.day),
    );
    const daysSinceMonday = (anchorDate.getUTCDay() + 6) % 7;
    anchorDate.setUTCDate(anchorDate.getUTCDate() - daysSinceMonday);
    const start = toBangkokStart({
      year: anchorDate.getUTCFullYear(),
      month: anchorDate.getUTCMonth() + 1,
      day: anchorDate.getUTCDate(),
    });
    return { start, end: addCalendarDays(start, 7), bucket: "day" as const };
  }

  if (period === "month") {
    const start = toBangkokStart({ ...anchor, day: 1 });
    return {
      start,
      end: toBangkokStart({ year: anchor.year, month: anchor.month + 1, day: 1 }),
      bucket: "day" as const,
    };
  }

  if (period === "quarter") {
    const quarterStartMonth = Math.floor((anchor.month - 1) / 3) * 3 + 1;
    const start = toBangkokStart({
      year: anchor.year,
      month: quarterStartMonth,
      day: 1,
    });
    return {
      start,
      end: toBangkokStart({
        year: anchor.year,
        month: quarterStartMonth + 3,
        day: 1,
      }),
      bucket: "month" as const,
    };
  }

  const start = toBangkokStart({ year: anchor.year, month: 1, day: 1 });
  return {
    start,
    end: toBangkokStart({ year: anchor.year + 1, month: 1, day: 1 }),
    bucket: "month" as const,
  };
}

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
    const currentRange = getRange(input.period, anchor);
    const previousAnchor = getBangkokDateParts(
      new Date(currentRange.start.getTime() - 1),
    );
    const previousRange = getRange(input.period, previousAnchor);

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
      date: `${anchor.year}-${String(anchor.month).padStart(2, "0")}-${String(
        anchor.day,
      ).padStart(2, "0")}`,
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
