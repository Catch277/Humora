/**
 * The calendar-date check every request-body parser shares.
 *
 * It started inside `app/api/schedules/_lib/scheduleRequest.ts` (SCRUM-30) and moved here when the
 * request parser needed the same rule (SCRUM-82): a date in a payload has to be a real day, not merely
 * a string shaped like one. `_lib` folders belong to one resource, so a second resource importing from
 * them would be a hidden coupling — this folder is the HTTP layer's shared one, next to
 * `requireCaller.ts` and `shiftWorkflow.ts`.
 *
 * The rules that *act* on the value (a ca that has ended, a day in the past) stay with their own use
 * case; this is only "is it a day at all".
 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Round-trips the calendar date so `2026-02-31` is rejected instead of rolling into March. */
export function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}
