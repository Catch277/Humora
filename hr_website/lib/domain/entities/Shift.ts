export const SHIFT_ASSIGNMENT_STATUSES = [
  "SCHEDULED",
  "LEAVE",
  "CANCELLED",
] as const;

export type ShiftAssignmentStatus = (typeof SHIFT_ASSIGNMENT_STATUSES)[number];

/**
 * A row of the `shifts` catalogue (ca làm việc): the shift *template* — name and hours —
 * which quick search already reads. It is not a person's assignment; one template is
 * referenced by many `shift_assignments`.
 *
 * `branch_id = null` means the template applies to every branch (e.g. "Ca sáng" everywhere).
 */
export interface Shift {
  id: string;
  name: string;
  branch_id: string | null;
  start_time: string | null;
  end_time: string | null;
}

export interface ShiftAssignment {
  id: string;
  employee_id: string;
  branch_id: string;
  shift_id: string;
  work_date: string;
  status: ShiftAssignmentStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
  /** Hydrated from the foreign keys by the repository; null when RLS hides the row. */
  employee: { id: string; full_name: string } | null;
  shift: Shift | null;
}

export interface CreateShiftAssignmentInput {
  employeeId: string;
  branchId: string;
  shiftId: string;
  workDate: string;
  status: ShiftAssignmentStatus;
  note: string | null;
}

export type UpdateShiftAssignmentInput = CreateShiftAssignmentInput;

export interface ShiftAssignmentFilters {
  branchId?: string;
  employeeId?: string;
  startDate?: string;
  endDate?: string;
}
