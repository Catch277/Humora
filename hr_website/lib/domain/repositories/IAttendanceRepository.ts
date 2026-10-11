import type {
  Attendance,
  AttendanceCheckInInput,
  AttendanceCheckOutInput,
  AttendanceCorrectionInput,
  AttendanceFilters,
  AttendanceStatus,
} from "@/lib/domain/entities/Attendance";

export interface IAttendanceRepository {
  findAll(filters: AttendanceFilters): Promise<Attendance[]>;
  findById(id: string): Promise<Attendance | null>;
  /**
   * Records one check-in (SCRUM-68). The caller, the branch and the shifts are already resolved by the
   * use case; this only translates the input into `public.attendance` and lets the database derive the
   * distance from the point.
   */
  create(input: AttendanceCheckInInput): Promise<Attendance>;
  /**
   * Closes one record (SCRUM-68). Which row and which status are the use case's decision — this writes
   * `check_out_at`, the point and the status, and answers `AttendanceNotFoundError` when RLS hides the row.
   */
  checkOut(id: string, input: AttendanceCheckOutInput): Promise<Attendance>;
  /**
   * Undoes a check-out while the ca is still running ("Vào ca lại", SCRUM-68): clears the closing columns
   * and stores the arrival's status again. The check-in facts are left exactly as they were.
   */
  reopen(id: string, status: AttendanceStatus): Promise<Attendance>;
  /** Stores the employee's khiếu nại against an existing record (SCRUM-29) and marks it OPEN. */
  recordComplaint(id: string, complaint: string): Promise<Attendance>;
  /** Closes an open complaint (SCRUM-23). */
  resolveComplaint(id: string, resolverId: string): Promise<Attendance>;
  /** Fixes the times of a record and records who did it and why (SCRUM-23). */
  correct(
    id: string,
    input: AttendanceCorrectionInput & { correctorId: string; correctedAt: string },
  ): Promise<Attendance>;
  /** Marks a record as reviewed by a manager: `verified_by` + `verified_at`. */
  verify(id: string, verifierId: string): Promise<Attendance>;
}