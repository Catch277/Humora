/**
 * Vietnamese copy for the shift-registration / shift-swap workflow (SCRUM-23).
 *
 * `review_shift_registration()` and the other `security definer` functions in
 * `supabase/sql/SCRUM-23_shift_registration_swap.sql` raise their sentences in English, and
 * `throwShiftWorkflowError()` hands that text to a domain error whose `message` the route puts in the JSON
 * body. Nothing called those endpoints from the app until `/schedules` learned to review a registration
 * (SCRUM-92), so an English sentence was invisible; from that screen on it is a sentence a manager reads.
 *
 * The keys are the **stored texts verbatim** — SQL cannot be reworded here (an applied script is never
 * edited), so this table is the one place that maps them, and both sides have to change together. A text
 * this table does not know is returned unchanged, which is what keeps an unfamiliar database message
 * readable instead of blank.
 *
 * The classification of an error (403/404/409/400) never reads this text: it is decided by the error class
 * in `shiftWorkflowErrors.ts`, exactly so that translating a sentence cannot move a status code.
 */
const SHIFT_WORKFLOW_MESSAGES: Readonly<Record<string, string>> = {
  // ── Đăng ký ca (review_shift_registration) ────────────────────────────────────────────────
  "Only the owner or the head of this branch may review a registration.":
    "Chỉ chủ sở hữu tổ chức hoặc trưởng chi nhánh này mới được duyệt đăng ký ca.",
  "Only a pending registration can be reviewed.":
    "Chỉ đăng ký đang chờ duyệt mới xử lý được — đăng ký này đã được duyệt, từ chối hoặc huỷ.",
  "A reason is required to reject a registration.":
    "Vui lòng nêu lý do khi từ chối đăng ký ca.",
  "The employee is on leave that day.":
    "Nhân viên đang nghỉ phép ngày đó nên không duyệt được.",
  "The employee already holds this shift that day.":
    "Nhân viên đã có ca này trong ngày đó rồi.",
  "The employee already has a shift that overlaps these hours.":
    "Nhân viên đã có ca trùng giờ trong ngày đó.",

  // ── Chuyển ca (request_shift_swap / respond_shift_swap / review_shift_swap) ───────────────
  "Only a scheduled shift can be handed over.":
    "Chỉ ca đang ở trạng thái đi làm mới chuyển được.",
  "A shift in the past cannot be handed over.": "Không thể chuyển một ca đã qua.",
  "This shift already has an attendance record.":
    "Ca này đã có bản ghi chấm công nên không chuyển được.",
  "The colleague must be another active employee of the same branch.":
    "Người nhận ca phải là nhân viên đang làm việc cùng chi nhánh với bạn.",
  "This shift already has an open swap request.":
    "Ca này đã có một yêu cầu chuyển ca đang mở.",
  "Only a pending swap can be answered.":
    "Chỉ yêu cầu chuyển ca đang chờ mới phản hồi được.",
  "Only an open swap can be cancelled.":
    "Chỉ yêu cầu chuyển ca còn mở mới huỷ được.",
  "Only the owner or the head of this branch may review a swap.":
    "Chỉ chủ sở hữu tổ chức hoặc trưởng chi nhánh này mới được duyệt chuyển ca.",
  "Only a swap accepted by the colleague can be reviewed.":
    "Chỉ yêu cầu đã được đồng nghiệp nhận mới duyệt được.",
  "The shift is no longer assigned to the requester.":
    "Ca này không còn thuộc về người gửi yêu cầu nữa.",
  "A reason is required to reject a swap.": "Vui lòng nêu lý do khi từ chối chuyển ca.",

  // ── Phiên đăng nhập (cả hai nhóm) ─────────────────────────────────────────────────────────
  "Authentication is required.":
    "Bạn cần đăng nhập để thực hiện thao tác này.",
};

/**
 * The Vietnamese sentence for a text this workflow can raise; the text itself when it is not one of ours.
 * `trim()` because PostgREST forwards the message as it was raised, and a trailing newline would miss an
 * exact lookup.
 */
export function shiftWorkflowMessage(text: string): string {
  return SHIFT_WORKFLOW_MESSAGES[text.trim()] ?? text;
}
