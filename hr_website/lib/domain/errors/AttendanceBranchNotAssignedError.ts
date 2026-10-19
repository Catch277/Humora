/**
 * The caller's `users.branch_id` is null (SCRUM-63), so there is no branch they may be clocked in at.
 * `attendance_insert_own` refuses the insert for the same reason (it compares `branch_id` with
 * `public.current_branch_id()`), which without this error would surface as an opaque `500`.
 */
export class AttendanceBranchNotAssignedError extends Error {
  constructor() {
    super(
      "Tài khoản của bạn chưa được gán chi nhánh nên chưa thể chấm công.",
    );
    this.name = "AttendanceBranchNotAssignedError";
  }
}
