import type { AttendanceStatus } from "@/lib/domain/entities/Attendance";

/**
 * Chấm công vào / ra ca (SCRUM-22, SCRUM-29): what the mobile app sends when an employee clocks in
 * or out. The employee comes from the session; the time comes from the server clock, never from the
 * device, so a wrong phone clock cannot rewrite the timesheet.
 *
 * `photoUrl` is the address of the verification photo the app already uploaded; this API stores the
 * reference, it does not receive the file.
 */
export interface ClockPointInput {
  latitude: number;
  longitude: number;
  photoUrl: string | null;
  note: string | null;
}

export interface CheckInInput extends ClockPointInput {
  /**
   * Which of today's assigned shifts is being started. Optional: with exactly one shift today the
   * use case picks it; with several, the caller must say which.
   */
  assignmentId: string | null;
}

export type CheckOutInput = ClockPointInput;

/** What the clock repository stores for a new check-in. */
export interface NewCheckInRecord {
  employeeId: string;
  branchId: string;
  shiftId: string;
  workDate: string;
  checkInAt: string;
  latitude: number;
  longitude: number;
  photoUrl: string | null;
  note: string | null;
  status: AttendanceStatus;
}

/** What the clock repository stores when the record is completed. */
export interface CheckOutRecord {
  checkOutAt: string;
  latitude: number;
  longitude: number;
  photoUrl: string | null;
  note: string | null;
  status: AttendanceStatus;
}

export const MAX_CLOCK_NOTE_LENGTH = 300;
export const MAX_CLOCK_PHOTO_URL_LENGTH = 2000;
