import type { Locale } from "@/lib/i18n/locales";

/**
 * Locale-aware numbers and dates.
 *
 * Currency and dates used to be formatted with a hard-coded `Intl.NumberFormat("vi-VN")` on every
 * screen; this module is the one copy of that rule now that a reader may be in English. Two decisions
 * are deliberate and must not be "simplified":
 *
 * - **English formats as `en-GB`.** The app writes day-first dates and a 24-hour clock (`05/10/2026`,
 *   `17:00`) — conventions that read the same way in either language — while month and weekday *names*
 *   follow the language. `en-US` would render the same row as "May 10th" and invert a date against what
 *   the Vietnamese manager next to the reader is looking at.
 * - **Timestamps stay pinned to `Asia/Bangkok`.** The server stores and serves UTC, so the *zone* is a
 *   business fact and only the *style* follows the reader (`lib/usecases/businessDay.ts`).
 */
const BUSINESS_TIME_ZONE = "Asia/Bangkok";

const NUMBER_FORMATS: Record<Locale, Intl.NumberFormat> = {
  vi: new Intl.NumberFormat("vi-VN"),
  en: new Intl.NumberFormat("en-GB"),
};

/** `day: "2-digit", month: "2-digit", year: "numeric"` — the shape string every formatter below shares. */
const DATE_PARTS = {
  day: "2-digit",
  month: "2-digit",
} as const;

const DATE_FORMATS: Record<Locale, Intl.DateTimeFormat> = {
  vi: new Intl.DateTimeFormat("vi-VN", {
    timeZone: BUSINESS_TIME_ZONE,
    ...DATE_PARTS,
    year: "numeric",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIME_ZONE,
    ...DATE_PARTS,
    year: "numeric",
  }),
};

const DATE_TIME_FORMATS: Record<Locale, Intl.DateTimeFormat> = {
  vi: new Intl.DateTimeFormat("vi-VN", {
    timeZone: BUSINESS_TIME_ZONE,
    ...DATE_PARTS,
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIME_ZONE,
    ...DATE_PARTS,
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }),
};

const TIME_FORMATS: Record<Locale, Intl.DateTimeFormat> = {
  vi: new Intl.DateTimeFormat("vi-VN", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }),
};

/**
 * Sunday-first, so the index is `Date.getUTCDay()`.
 *
 * The Vietnamese strings are the ones the screens have always shown (`T2`, `Thứ 2`) rather than CLDR's
 * abbreviation (`Th 2`): switching language must not restyle the Vietnamese week.
 */
const WEEKDAYS_SHORT: Record<Locale, readonly string[]> = {
  vi: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

const WEEKDAYS_LONG: Record<Locale, readonly string[]> = {
  vi: ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"],
  en: [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ],
};

const EMPTY = "—";

/** An instant as the API served it (UTC); `null` for a missing or unparsable value. */
function parseInstant(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * A `YYYY-MM-DD` business date, read **without** `Date` timezone handling: the day a ca belongs to is
 * the string the API returned, not an instant that could shift across midnight.
 */
function parseBusinessDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

/** The weekday index of a business date, in the UTC frame it was parsed in. */
function businessWeekday(value: string): number | null {
  const parsed = parseBusinessDate(value);

  return parsed ? parsed.getUTCDay() : null;
}

export function formatNumber(value: number, locale: Locale): string {
  return NUMBER_FORMATS[locale].format(value);
}

/** `1.234.567 ₫` (`vi`) / `1,234,567 ₫` (`en`) — the đồng symbol is the same in either language. */
export function formatCurrency(value: number, locale: Locale): string {
  return `${formatNumber(value, locale)} ₫`;
}

/** A delta with an explicit sign (`+50.000 ₫`, `-150.000 ₫`), zero without one — DESIGN.md §8. */
export function formatSignedCurrency(value: number, locale: Locale): string {
  if (value === 0) {
    return formatCurrency(0, locale);
  }

  return `${value > 0 ? "+" : "-"}${formatCurrency(Math.abs(value), locale)}`;
}

/**
 * `+4,2%` (`vi`) / `+4.2%` (`en`) — the decimal separator follows the reader (DESIGN.md §8) and the sign is
 * explicit, so a trend reads the same way in either language.
 */
export function formatPercent(value: number, locale: Locale): string {
  const fixed = value.toFixed(1);

  return `${value > 0 ? "+" : ""}${locale === "vi" ? fixed.replace(".", ",") : fixed}%`;
}

/** `05/10/2026`. */
export function formatDate(
  value: string | null | undefined,
  locale: Locale,
  empty: string = EMPTY,
): string {
  const parsed = parseInstant(value);

  return parsed ? DATE_FORMATS[locale].format(parsed) : empty;
}

/** `05/10/2026, 17:00`. */
export function formatDateTime(
  value: string | null | undefined,
  locale: Locale,
  empty: string = EMPTY,
): string {
  const parsed = parseInstant(value);

  return parsed ? DATE_TIME_FORMATS[locale].format(parsed) : empty;
}

/** `17:00` — a check-in time, not a date. */
export function formatTime(
  value: string | null | undefined,
  locale: Locale,
  empty: string = EMPTY,
): string {
  const parsed = parseInstant(value);

  return parsed ? TIME_FORMATS[locale].format(parsed) : empty;
}

/**
 * `05/10` for a `YYYY-MM-DD` business date — the short form the week header and the schedule cells use.
 *
 * It joins the parts of the string instead of going through `Intl`, for two reasons: the day is the
 * string the API returned (no instant, so no midnight shift), and `Intl`'s `vi-VN` short date is
 * `05-10`, which would silently restyle a header that has always read `05/10`. Day-first ordering is
 * the same in both languages, so there is nothing for a locale to decide.
 */
export function formatDayMonth(
  value: string | null | undefined,
  empty: string = EMPTY,
): string {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;

  return match ? `${match[3]}/${match[2]}` : empty;
}

/**
 * A `shifts.start_time` / `end_time` (`HH:MM:SS`) as `08:00`, without going through `Date` — the column
 * is a wall-clock `time`, so parsing it as an instant would move it. A template without hours answers
 * the caller's fallback (`--:--` on the schedule).
 */
export function formatClockTime(
  value: string | null | undefined,
  empty: string = "--:--",
): string {
  const match = value ? /^(\d{1,2}):(\d{2})/.exec(value.trim()) : null;

  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : empty;
}

/** `T2` / `Mon` for a `YYYY-MM-DD` business date. */
export function weekdayShort(
  value: string | null | undefined,
  locale: Locale,
  empty: string = EMPTY,
): string {
  const weekday = value ? businessWeekday(value) : null;

  return weekday === null ? empty : (WEEKDAYS_SHORT[locale][weekday] ?? empty);
}

/** `Thứ 2` / `Monday` for a `YYYY-MM-DD` business date. */
export function weekdayLong(
  value: string | null | undefined,
  locale: Locale,
  empty: string = EMPTY,
): string {
  const weekday = value ? businessWeekday(value) : null;

  return weekday === null ? empty : (WEEKDAYS_LONG[locale][weekday] ?? empty);
}
