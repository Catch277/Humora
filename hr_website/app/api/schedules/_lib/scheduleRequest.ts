/**
 * HTTP-layer payload parsing shared by `POST /api/schedules` and `PUT /api/schedules/[id]`.
 *
 * It lives in a private folder (`_lib`, opted out of routing) so both route handlers keep the
 * same validation without duplicating it, and so request parsing stays in the HTTP layer
 * instead of leaking into the use cases. Mirrors `app/api/facilities/_lib/facilityRequest.ts`.
 */
import {
  SHIFT_ASSIGNMENT_STATUSES,
  type ShiftAssignmentStatus,
} from "@/lib/domain/entities/Shift";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const STATUS_SET: ReadonlySet<string> = new Set(SHIFT_ASSIGNMENT_STATUSES);

export type ParsedScheduleRequest = {
  employeeId: string;
  branchId: string;
  shiftId: string;
  workDate: string;
  status: ShiftAssignmentStatus;
  note: string | null;
};

export type ScheduleRequestResult =
  | { ok: true; input: ParsedScheduleRequest }
  | { ok: false; error: string };

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

export function parseScheduleRequest(payload: unknown): ScheduleRequestResult {
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, error: "The request body must be a JSON object." };
  }

  const body = payload as Record<string, unknown>;

  if (typeof body.employee_id !== "string" || !UUID_PATTERN.test(body.employee_id)) {
    return { ok: false, error: "employee_id is required and must be a UUID." };
  }

  if (typeof body.branch_id !== "string" || !UUID_PATTERN.test(body.branch_id)) {
    return { ok: false, error: "branch_id is required and must be a UUID." };
  }

  if (typeof body.shift_id !== "string" || !UUID_PATTERN.test(body.shift_id)) {
    return { ok: false, error: "shift_id is required and must be a UUID." };
  }

  if (typeof body.work_date !== "string" || !isCalendarDate(body.work_date)) {
    return {
      ok: false,
      error: "work_date is required and must be a calendar date (YYYY-MM-DD).",
    };
  }

  const rawStatus = body.status ?? "SCHEDULED";

  if (typeof rawStatus !== "string" || !STATUS_SET.has(rawStatus)) {
    return {
      ok: false,
      error: `status must be one of ${SHIFT_ASSIGNMENT_STATUSES.join(", ")}.`,
    };
  }

  if (
    body.note !== undefined &&
    body.note !== null &&
    (typeof body.note !== "string" || body.note.length > 500)
  ) {
    return { ok: false, error: "note must be a string of at most 500 characters." };
  }

  return {
    ok: true,
    input: {
      employeeId: body.employee_id,
      branchId: body.branch_id,
      shiftId: body.shift_id,
      workDate: body.work_date,
      status: rawStatus as ShiftAssignmentStatus,
      note: typeof body.note === "string" ? body.note : null,
    },
  };
}
