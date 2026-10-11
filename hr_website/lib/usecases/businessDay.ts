const BUSINESS_TIME_ZONE = "Asia/Bangkok";

/**
 * The business date (YYYY-MM-DD) of `now` in Asia/Bangkok (UTC+7, no DST). `current_date` and the
 * server clock would use UTC, which is the previous day between 00:00 and 07:00 local time.
 */
export function getBusinessDay(now: Date): string {
  // `en-CA` formats a date as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function getBusinessDayRange(now: Date): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, Number(value)]),
  ) as Record<"year" | "month" | "day", number>;

  // Asia/Bangkok is UTC+7 and does not observe daylight saving time.
  const start = new Date(
    Date.UTC(values.year, values.month - 1, values.day, -7),
  );
  const end = new Date(
    Date.UTC(values.year, values.month - 1, values.day + 1, -7),
  );

  return { start, end };
}
