import type { Shift } from "@/lib/domain/entities/Shift";

export const ATTENDANCE_STATUSES = [
  "ON_TIME",
  "LATE",
  "EARLY_LEAVE",
  "ABSENT",
  "INCOMPLETE",
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/**
 * The branch fields the screen needs to judge the geofence, embedded from `branch_id` so the
 * validity verdict (distance vs `attendance_radius`) needs no second request.
 */
export interface AttendanceBranch {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  attendance_radius: number;
}

/**
 * One check-in record: an employee, a work date and (usually) a scheduled shift.
 *
 * Both clients write rows since SCRUM-68: the mobile app captures the GPS point *and* a photo, while
 * `/check-in` on the web records the point alone (no Storage bucket, so `check_in_photo_url` stays null)
 * — which is why the review screen must keep rendering "Ảnh xác minh: —" as a normal outcome. Reading,
 * reviewing and correcting stay a web task either way.
 */
export interface Attendance {
  id: string;
  employee_id: string;
  branch_id: string;
  shift_id: string | null;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_latitude: number | null;
  check_in_longitude: number | null;
  check_out_latitude: number | null;
  check_out_longitude: number | null;
  /** Distance in metres between the check-in point and the branch centre (derived in the database). */
  check_in_distance_m: number | null;
  check_in_photo_url: string | null;
  check_out_photo_url: string | null;
  /**
   * Time actually worked, in seconds, accumulated by `attendance_track_worked_time` (SCRUM-69): every
   * check-out adds the segment that began at the check-in (or at the last re-open), so the pause between a
   * check-out and a "Vào ca lại" is never counted. Derived in the database — clients never send it.
   */
  worked_seconds: number;
  /** When the current segment began after a re-open (SCRUM-69); `null` while the ca has not been re-opened. */
  resumed_at: string | null;
  status: AttendanceStatus;
  note: string | null;
  complaint: string | null;
  complaint_at: string | null;
  /** `OPEN` from the moment a complaint is stored until a manager resolves it. */
  complaint_status: AttendanceComplaintStatus | null;
  complaint_resolved_by: string | null;
  complaint_resolved_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  /** Set when a manager corrected the record (SCRUM-23), with the reason they gave. */
  corrected_by: string | null;
  corrected_at: string | null;
  correction_reason: string | null;
  created_at: string;
  updated_at: string;
  /** Hydrated from the foreign keys; null when RLS hides the related row. */
  employee: { id: string; full_name: string } | null;
  branch: AttendanceBranch | null;
  shift: Shift | null;
}

export const ATTENDANCE_COMPLAINT_STATUSES = ["OPEN", "RESOLVED"] as const;

export type AttendanceComplaintStatus =
  (typeof ATTENDANCE_COMPLAINT_STATUSES)[number];

/** What a manager may fix on a record, and the reason the correction must carry. */
export interface AttendanceCorrectionInput {
  checkInAt: string | null;
  checkOutAt: string | null;
  status: AttendanceStatus;
  note: string | null;
  correctionReason: string;
}

export interface AttendanceFilters {
  branchId?: string;
  employeeId?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}

/**
 * What the web check-in writes (SCRUM-68): camelCase, translated to the snake_case columns by
 * `SupabaseAttendanceRepository`.
 *
 * The caller, the branch and the ca are all resolved before this is built — the body never names the
 * employee — and the distance is deliberately absent: `attendance_compute_distance` derives
 * `check_in_distance_m` from the stored point, so the two can never disagree.
 */
export interface AttendanceCheckInInput {
  employeeId: string;
  branchId: string;
  /** `null` for a check-in without a ca (a manager who picked none); the reviewer reads it as unscheduled. */
  shiftId: string | null;
  workDate: string;
  checkInAt: string;
  checkInLatitude: number | null;
  checkInLongitude: number | null;
  status: AttendanceStatus;
  note: string | null;
}

/** What the web check-out writes (SCRUM-68): the closing time, its point and the resulting status. */
export interface AttendanceCheckOutInput {
  checkOutAt: string;
  checkOutLatitude: number | null;
  checkOutLongitude: number | null;
  status: AttendanceStatus;
}

export interface AttendanceComplaintInput {
  attendanceId: string;
  complaint: string;
}