import type { Shift } from "@/lib/domain/entities/Shift";

export interface RequestEntity {
  id: string;
  branch_id: string;
  /** The employee who filed the request (`public.users.id`); hydrated into `requester`. */
  user_id: string;
  request_type: string;
  title: string | null;
  content: string | null;
  /**
   * The day the đơn is about (SCRUM-82). `null` on a row filed before that script and on a `Khác` đơn,
   * which has no day.
   */
  work_date: string | null;
  /** The ca being handed over, for a "Đổi ca" đơn (SCRUM-82); hydrated into `shift`. */
  shift_id: string | null;
  /** The colleague who takes that ca (SCRUM-82); hydrated into `target_employee`. */
  target_employee_id: string | null;
  status: string;
  reject_reason: string | null;
  approver_id: string | null;
  created_at: string;
  updated_at: string;
  /**
   * Hydrated from the `user_id` foreign key by the repository. Null when RLS hides the
   * profile, so the screens must not assume a name is present.
   */
  requester: { id: string; full_name: string } | null;
  /** Hydrated from the `shift_id` foreign key; null for every type that names no ca. */
  shift: Shift | null;
  /** Hydrated from the `target_employee_id` foreign key; null for every type that names nobody. */
  target_employee: { id: string; full_name: string } | null;
}

export interface RequestFilters {
  branchId?: string;
  requestType?: string;
  status?: string;
}

export type ReviewStatus = "APPROVED" | "REJECTED";

export interface ReviewRequestInput {
  status: ReviewStatus;
  rejectReason: string | null;
  approverId: string;
}

/**
 * The kinds of đơn the chain files (SCRUM-41: nghỉ phép, đổi ca, điều chỉnh công). The value is
 * stored verbatim in `requests.request_type` as the label the queue, the dashboard and quick search
 * already display, so nothing has to translate it on the way out, and the review screen's preset
 * reject reasons ("Trùng lịch", "Hết phép năm có lương") line up with it.
 */
export const REQUEST_TYPES = [
  "Nghỉ phép",
  "Đổi ca",
  "Điều chỉnh công",
  "Khác",
] as const;

export type RequestType = (typeof REQUEST_TYPES)[number];

/**
 * How long the two free-text fields may be. They live here, next to the type list, because the
 * route handler (which answers `400`), the use case (which repeats the rule) and the screen (which
 * caps its inputs) all need the same numbers — a second copy would drift.
 */
export const MAX_REQUEST_TITLE_LENGTH = 120;
export const MAX_REQUEST_CONTENT_LENGTH = 500;

/** Shared by the route handler (which validates a payload) and the screen (which builds one). */
export function isRequestType(value: unknown): value is RequestType {
  return (
    typeof value === "string" && (REQUEST_TYPES as readonly string[]).includes(value)
  );
}

/**
 * The types that act on one day, and therefore must name it (SCRUM-82/83).
 *
 * `Khác` is deliberately absent: it is the catch-all for anything the three named types do not
 * describe, and the operation files those without a day ("máy hỏng", "khách phàn nàn"). This list, the
 * `in (...)` test inside `requests_guard_shift_details` (SCRUM-83) and `requests_request_type_check`
 * (SCRUM-62) are one vocabulary in three places — they change together.
 */
export const REQUEST_TYPES_WITH_WORK_DATE = [
  "Nghỉ phép",
  "Đổi ca",
  "Điều chỉnh công",
] as const;

export function requestNeedsWorkDate(value: string): boolean {
  return (REQUEST_TYPES_WITH_WORK_DATE as readonly string[]).includes(value);
}

/**
 * "Đổi ca" is the one type that names a ca and the colleague who takes it; approving it moves the
 * assignment (SCRUM-83), so both fields are required and the database says so too.
 */
export function requestNeedsSwapDetails(value: string): boolean {
  return value === "Đổi ca";
}

/**
 * What a member files: their own đơn, for one branch, always `PENDING` until a manager reviews it.
 * The requester is deliberately absent — it comes from the session (see `IRequestRepository.create`).
 *
 * The three detail fields (SCRUM-82) are the camelCase half of `work_date` / `shift_id` /
 * `target_employee_id`; the repository is what translates them. They are `null` for the types that do
 * not use them, never `undefined`, so "the screen cleared it" and "the type does not carry it" travel
 * as the same value.
 */
export interface CreateRequestInput {
  branchId: string;
  requestType: RequestType;
  title: string;
  content: string | null;
  workDate: string | null;
  shiftId: string | null;
  targetEmployeeId: string | null;
}


