/**
 * HTTP-layer payload parsing for `POST /api/requests` (SCRUM-41/82), in the private `_lib` folder so the
 * route handler keeps the shape the rest of the API uses: validate by hand, name the offending field,
 * answer `400`.
 *
 * Two kinds of rule belong here rather than in a use case: the *shape* of a value (a UUID, a calendar
 * date, a length) and whether a request type carries a field at all. The rules that act on the values —
 * the day must not be past, the ca must be the caller's, the colleague must be free — are business rules
 * and live in `CreateRequestUseCase` / `lib/usecases/requestDetails.ts`, with the database triggers of
 * `SCRUM-83_request_effects.sql` as the backstop for writers this parser never sees.
 */
import { isCalendarDate } from "@/app/api/_lib/calendarDate";
import {
  MAX_REQUEST_CONTENT_LENGTH,
  MAX_REQUEST_TITLE_LENGTH,
  REQUEST_TYPES,
  isRequestType,
  requestNeedsSwapDetails,
  requestNeedsWorkDate,
  type CreateRequestInput,
} from "@/lib/domain/entities/RequestEntity";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RequestRequestResult =
  | { ok: true; input: CreateRequestInput }
  | { ok: false; error: string };

/**
 * `null` when the field is absent or explicitly `null` — both are valid for an optional field, because a
 * screen clears one with `value || null` and an older client omits it. Anything else is `null` too, and
 * the caller has already checked the type by then.
 */
function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function parseRequestPayload(payload: unknown): RequestRequestResult {
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, error: "Nội dung yêu cầu phải là một đối tượng JSON." };
  }

  const body = payload as Record<string, unknown>;
  const branchId = body.branch_id;

  if (typeof branchId !== "string" || !UUID_PATTERN.test(branchId)) {
    return { ok: false, error: "branch_id là bắt buộc và phải là UUID." };
  }

  if (!isRequestType(body.request_type)) {
    return {
      ok: false,
      error: `request_type phải là một trong: ${REQUEST_TYPES.join(", ")}.`,
    };
  }

  const requestType = body.request_type;
  const rawTitle = body.title;

  if (
    typeof rawTitle !== "string" ||
    !rawTitle.trim() ||
    rawTitle.trim().length > MAX_REQUEST_TITLE_LENGTH
  ) {
    return {
      ok: false,
      error: `title là bắt buộc và tối đa ${MAX_REQUEST_TITLE_LENGTH} ký tự.`,
    };
  }

  if (
    body.content !== undefined &&
    body.content !== null &&
    (typeof body.content !== "string" ||
      body.content.trim().length > MAX_REQUEST_CONTENT_LENGTH)
  ) {
    return {
      ok: false,
      error: `content tối đa ${MAX_REQUEST_CONTENT_LENGTH} ký tự.`,
    };
  }

  const workDate = optionalString(body.work_date);

  if (workDate !== null && !isCalendarDate(workDate)) {
    return { ok: false, error: "work_date phải là một ngày dạng YYYY-MM-DD." };
  }

  const shiftId = optionalString(body.shift_id);

  if (shiftId !== null && !UUID_PATTERN.test(shiftId)) {
    return { ok: false, error: "shift_id phải là UUID." };
  }

  const targetEmployeeId = optionalString(body.target_employee_id);

  if (targetEmployeeId !== null && !UUID_PATTERN.test(targetEmployeeId)) {
    return { ok: false, error: "target_employee_id phải là UUID." };
  }

  // A type that acts on a day has to name one, and "Đổi ca" additionally names the ca and the colleague
  // who takes it (SCRUM-82). Answering here is what turns a missing field into a `400` that names it,
  // instead of the trigger's sentence arriving through a generic error.
  if (requestNeedsWorkDate(requestType) && workDate === null) {
    return {
      ok: false,
      error: "work_date là bắt buộc với loại đơn này (YYYY-MM-DD).",
    };
  }

  if (
    requestNeedsSwapDetails(requestType) &&
    (shiftId === null || targetEmployeeId === null)
  ) {
    return {
      ok: false,
      error:
        "Đơn đổi ca cần có shift_id (ca cần đổi) và target_employee_id (đồng nghiệp nhận ca).",
    };
  }

  return {
    ok: true,
    input: {
      branchId,
      requestType,
      title: rawTitle.trim(),
      // A blank note is an absent note, never an empty string in the column.
      content: optionalString(body.content),
      // A type that does not use a field stores none of it, so a body cannot smuggle a ca and a colleague
      // onto a "Nghỉ phép" đơn and have the approval trigger read them.
      workDate: requestNeedsWorkDate(requestType) ? workDate : null,
      shiftId: requestNeedsSwapDetails(requestType) ? shiftId : null,
      targetEmployeeId: requestNeedsSwapDetails(requestType)
        ? targetEmployeeId
        : null,
    },
  };
}
