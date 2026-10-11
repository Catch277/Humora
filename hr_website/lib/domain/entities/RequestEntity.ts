export interface RequestEntity {
  id: string;
  branch_id: string;
  /** The employee who filed the request (`public.users.id`); hydrated into `requester`. */
  user_id: string;
  request_type: string;
  title: string | null;
  content: string | null;
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
 * What a member files: their own đơn, for one branch, always `PENDING` until a manager reviews it.
 * The requester is deliberately absent — it comes from the session (see `IRequestRepository.create`).
 */
export interface CreateRequestInput {
  branchId: string;
  requestType: RequestType;
  title: string;
  content: string | null;
}

