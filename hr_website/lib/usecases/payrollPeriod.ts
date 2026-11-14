/**
 * Payroll periods (SCRUM-90): a month, written as `YYYY-MM`.
 *
 * Three places need the same arithmetic and must not drift: the screen's month navigator, the query the
 * screen sends and the default month `/api/payroll/estimate` answers with. A string is used rather than a
 * `Date` because a payroll month has no instant — `payslips.period_start` is the first day of a *business*
 * month in Asia/Bangkok, and passing a `Date` through PostgREST would let a timezone move it.
 */
const PERIOD_PATTERN = /^(\d{4})-(\d{2})$/;

/** The month it is right now in Asia/Bangkok (UTC+7, no DST) — the screen's default and the API's fallback. */
export function businessMonth(now: Date = new Date()): string {
  const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000);

  return `${bangkok.getUTCFullYear()}-${String(bangkok.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The month `delta` months away, for the ‹ › buttons; an unknown month is returned untouched. */
export function shiftPayrollMonth(month: string, delta: number): string {
  const match = PERIOD_PATTERN.exec(month);

  if (!match) {
    return month;
  }

  const index = Number(match[2]) - 1 + delta;
  const year = Number(match[1]) + Math.floor(index / 12);
  const normalized = ((index % 12) + 12) % 12;

  return `${year}-${String(normalized + 1).padStart(2, "0")}`;
}

/** `10/2026` — the label the month navigator shows, in the order Vietnamese screens write dates. */
export function payrollMonthLabel(month: string): string {
  const match = PERIOD_PATTERN.exec(month);

  return match ? `${match[2]}/${match[1]}` : month;
}
