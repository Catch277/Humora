export const EMPLOYEE_STATUSES = [
  "WORKING",
  "NOT_STARTED",
  "ON_LEAVE",
  "FINISHED",
  "NO_SHIFT",
  "RESIGNED",
] as const;

export type EmployeeStatusValue = (typeof EMPLOYEE_STATUSES)[number];

/**
 * One row of `get_employee_status` (SCRUM-22): who is working right now, who has not started, who
 * is on leave, who has finished and who is no longer with the company.
 *
 * `FINISHED` (checked out) and `NO_SHIFT` (nothing scheduled today) are derived states the old
 * mock did not have — without them a checked-out employee would look like "chưa vào ca".
 */
export interface EmployeeStatus {
  work_date: string;
  employee_id: string;
  full_name: string;
  role: string;
  branch_id: string | null;
  branch_name: string | null;
  status: EmployeeStatusValue;
  shift_name: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_distance_m: number | null;
  attendance_radius: number | null;
}

export interface EmployeeStatusFilters {
  branchId?: string;
  workDate?: string;
}