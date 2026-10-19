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
import { isCalendarDate } from "@/app/api/_lib/calendarDate";

// Re-exported so both schedule handlers keep importing this one module, exactly as they did before the
// check moved to the shared `app/api/_lib` folder (SCRUM-82 needed the same rule for request payloads).
export { isCalendarDate };

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export function parseScheduleRequest(payload: unknown): ScheduleRequestResult {
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, error: "Nội dung yêu cầu phải là một đối tượng JSON." };
  }

  const body = payload as Record<string, unknown>;

  if (typeof body.employee_id !== "string" || !UUID_PATTERN.test(body.employee_id)) {
    return { ok: false, error: "employee_id là bắt buộc và phải là UUID." };
  }

  if (typeof body.branch_id !== "string" || !UUID_PATTERN.test(body.branch_id)) {
    return { ok: false, error: "branch_id là bắt buộc và phải là UUID." };
  }

  if (typeof body.shift_id !== "string" || !UUID_PATTERN.test(body.shift_id)) {
    return { ok: false, error: "shift_id là bắt buộc và phải là UUID." };
  }

  if (typeof body.work_date !== "string" || !isCalendarDate(body.work_date)) {
    return {
      ok: false,
      error: "work_date là bắt buộc và phải là ngày dạng YYYY-MM-DD.",
    };
  }

  const rawStatus = body.status ?? "SCHEDULED";

  if (typeof rawStatus !== "string" || !STATUS_SET.has(rawStatus)) {
    return {
      ok: false,
      error: `status phải là một trong: ${SHIFT_ASSIGNMENT_STATUSES.join(", ")}.`,
    };
  }

  if (
    body.note !== undefined &&
    body.note !== null &&
    (typeof body.note !== "string" || body.note.length > 500)
  ) {
    return { ok: false, error: "note tối đa 500 ký tự." };
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
