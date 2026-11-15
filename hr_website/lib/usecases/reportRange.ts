import type { RevenueReportPeriod } from "@/lib/domain/entities/RevenueReport";

/**
 * The one copy of "what does a reporting period mean" (SCRUM-44), shared by the revenue report screen
 * and the dashboard (A5/SCRUM-98).
 *
 * Everything here is business time: Asia/Bangkok (UTC+7, no DST). A range starts at local midnight and
 * ends at the next local midnight, which is why `toBangkokStart` subtracts seven hours from `Date.UTC`
 * instead of relying on the server's timezone.
 */
export type DateParts = { year: number; month: number; day: number };

export type ReportRange = { start: Date; end: Date; bucket: "day" | "month" };

const BUSINESS_TIME_ZONE = "Asia/Bangkok";

export function getBangkokDateParts(date: Date): DateParts {
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

export function toBangkokStart({ year, month, day }: DateParts): Date {
  // Asia/Bangkok is UTC+7 and does not observe daylight saving time.
  return new Date(Date.UTC(year, month - 1, day, -7));
}

export function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** `2026-11-15` — the `YYYY-MM-DD` shape the API answers and the SQL scripts take. */
export function formatDateParts({ year, month, day }: DateParts): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * The anchor of a report request. A missing value means "today in Asia/Bangkok"; anything else must be
 * a real calendar date, so `2026-02-30` is refused instead of silently becoming 2 March. The two
 * messages are Vietnamese because the route answers them verbatim (`400`).
 */
export function parseReportDate(value: string | undefined, now: Date): DateParts {
  if (!value) {
    return getBangkokDateParts(now);
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("Ngày phải theo định dạng YYYY-MM-DD.");
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
    throw new Error("Ngày không hợp lệ.");
  }

  return parts;
}

/**
 * The instant range of one period around an anchor, plus the bucket its series is aggregated in.
 *
 * A year is read month by month; a quarter too. Day, week and month are read day by day, so a month
 * chart is its 28–31 columns rather than one bar.
 */
export function getReportRange(
  period: RevenueReportPeriod,
  anchor: DateParts,
): ReportRange {
  if (period === "day") {
    const start = toBangkokStart(anchor);
    return { start, end: addCalendarDays(start, 1), bucket: "day" };
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
    return { start, end: addCalendarDays(start, 7), bucket: "day" };
  }

  if (period === "month") {
    const start = toBangkokStart({ ...anchor, day: 1 });
    return {
      start,
      end: toBangkokStart({ year: anchor.year, month: anchor.month + 1, day: 1 }),
      bucket: "day",
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
      bucket: "month",
    };
  }

  const start = toBangkokStart({ year: anchor.year, month: 1, day: 1 });
  return {
    start,
    end: toBangkokStart({ year: anchor.year + 1, month: 1, day: 1 }),
    bucket: "month",
  };
}
