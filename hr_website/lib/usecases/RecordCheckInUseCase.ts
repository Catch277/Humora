import type { Attendance } from "@/lib/domain/entities/Attendance";
import { AttendanceAlreadyCheckedInError } from "@/lib/domain/errors/AttendanceAlreadyCheckedInError";
import { AttendanceBranchNotAssignedError } from "@/lib/domain/errors/AttendanceBranchNotAssignedError";
import { AttendanceBranchRequiredError } from "@/lib/domain/errors/AttendanceBranchRequiredError";
import { AttendanceCheckInForbiddenError } from "@/lib/domain/errors/AttendanceCheckInForbiddenError";
import { AttendanceNoShiftTodayError } from "@/lib/domain/errors/AttendanceNoShiftTodayError";
import { BranchForbiddenError } from "@/lib/domain/errors/BranchForbiddenError";
import { ShiftNotFoundError } from "@/lib/domain/errors/ShiftNotFoundError";
import type { IAttendanceRepository } from "@/lib/domain/repositories/IAttendanceRepository";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";
import type { IShiftAssignmentRepository } from "@/lib/domain/repositories/IShiftAssignmentRepository";
import type { IShiftRepository } from "@/lib/domain/repositories/IShiftRepository";
import { isManagerRole, isOwnerRole } from "@/lib/domain/roles";
import {
  isShiftStillRunning,
  resolveCheckInStatus,
  resolveStoredStatus,
} from "@/lib/usecases/attendanceStatus";
import { assertBranchManagedBy } from "@/lib/usecases/branchScope";
import { getBusinessDay } from "@/lib/usecases/businessDay";

/**
 * The caller as the route handler knows it (SCRUM-68) — who clocks in, their role and the branch they
 * belong to. All three come from the session; the body never names the employee.
 */
export type RecordCheckInUseCaseInput = {
  callerId: string;
  callerRole: string;
  /** `users.branch_id`; `null` means the account belongs to no branch yet. */
  callerBranchId: string | null;
  /** The GPS point of the arrival, or `null` when the device refused to provide one. */
  latitude: number | null;
  longitude: number | null;
  /** The branch a MANAGER clocks in at; ignored for an employee, whose branch is their own. */
  branchId: string | null;
  /** The ca being started: required for an employee (it identifies which ca), optional for a manager. */
  shiftId: string | null;
  note: string | null;
};

type CheckInTarget = {
  branchId: string;
  shiftId: string | null;
  /** `shifts.start_time`, the hour the lateness verdict is measured against. */
  shiftStartTime: string | null;
  /** `shifts.end_time`, the hour that decides whether a check-out can still be undone. */
  shiftEndTime: string | null;
};

/** `created` is `false` when an existing record was re-opened ("Vào ca lại") instead of created. */
export type RecordCheckInResult = {
  attendance: Attendance;
  created: boolean;
};

/**
 * Records one arrival (SCRUM-68): the web counterpart of the mobile check-in, for the two roles that
 * actually work a ca — the organization's `OWNER` is refused.
 *
 * An `EMPLOYEE` is clocked in against a ca they are scheduled for that business day (`shift_assignments`
 * supplies both the branch and the hours), a `MANAGER` against a branch they head (SCRUM-61) and an
 * optional ca. The GPS point is stored as measured and never judged here: the database derives
 * `check_in_distance_m` and the reviewer reads the verdict, which keeps the haversine in one place.
 */
export class RecordCheckInUseCase {
  constructor(
    private readonly attendanceRepository: IAttendanceRepository,
    private readonly shiftAssignmentRepository: IShiftAssignmentRepository,
    private readonly shiftRepository: IShiftRepository,
    private readonly branchRepository: IBranchRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: RecordCheckInUseCaseInput): Promise<RecordCheckInResult> {
    // SCRUM-68: the owner stands above the operation, so they never clock in. `attendance:checkin` keeps
    // them out of the route and `attendance_insert_own` out of the table; this is the middle layer.
    if (isOwnerRole(input.callerRole)) {
      throw new AttendanceCheckInForbiddenError();
    }

    const now = this.now();
    const workDate = getBusinessDay(now);

    const target = isManagerRole(input.callerRole)
      ? await this.resolveManagerTarget(input)
      : await this.resolveEmployeeTarget(input, workDate);

    const existing = await this.findExisting(
      input.callerId,
      workDate,
      target.shiftId,
    );

    if (existing) {
      return { attendance: await this.rejoin(existing, now, target), created: false };
    }

    const attendance = await this.attendanceRepository.create({
      employeeId: input.callerId,
      branchId: target.branchId,
      shiftId: target.shiftId,
      workDate,
      checkInAt: now.toISOString(),
      checkInLatitude: input.latitude,
      checkInLongitude: input.longitude,
      status: resolveCheckInStatus(now, target.shiftStartTime),
      note: input.note,
    });

    return { attendance, created: true };
  }

  /**
   * "Vào ca lại": somebody who closed the ca by mistake taps the same button again while the ca is still
   * running, and the row is re-opened instead of refused — no second row, and the check-in time they
   * already reported is kept.
   *
   * The arrival's verdict is **recomputed** from that stored giờ vào (`resolveStoredStatus`) rather than
   * read off the row: a check-out stores `EARLY_LEAVE`, and before this rule it could replace a `LATE` —
   * so trusting what was stored is exactly how a 11:38 arrival for an 08:00 ca ended up reading "Đúng
   * giờ". Two cases stay refused: the row was never closed (a plain duplicate), and the ca is over — then
   * the check-out stands, because it was the real end of the shift.
   */
  private async rejoin(
    existing: Attendance,
    now: Date,
    target: CheckInTarget,
  ): Promise<Attendance> {
    if (existing.check_out_at === null) {
      throw new AttendanceAlreadyCheckedInError();
    }

    if (!isShiftStillRunning(now, target.shiftEndTime)) {
      throw new AttendanceAlreadyCheckedInError(
        "This shift's working time is over, so its check-out stands.",
      );
    }

    return this.attendanceRepository.reopen(
      existing.id,
      resolveStoredStatus(existing, target.shiftStartTime),
    );
  }

  /** A manager names the branch they head (SCRUM-61); the ca is optional and only supplies the hours. */
  private async resolveManagerTarget(
    input: RecordCheckInUseCaseInput,
  ): Promise<CheckInTarget> {
    if (input.branchId === null) {
      throw new AttendanceBranchRequiredError();
    }

    // Answers `403` (another branch) or `404` (unknown) before the insert, instead of letting RLS match
    // no row, which the caller would read as "not found".
    await assertBranchManagedBy(this.branchRepository, input.branchId, {
      userId: input.callerId,
      role: input.callerRole,
    });

    if (input.shiftId === null) {
      // No ca chosen: the row is stored unscheduled, which the review screen shows as such — and without
      // hours there is no "working time" to judge, so a check-out on it can never be undone.
      return {
        branchId: input.branchId,
        shiftId: null,
        shiftStartTime: null,
        shiftEndTime: null,
      };
    }

    const shift = await this.shiftRepository.findById(input.shiftId);

    if (!shift) {
      throw new ShiftNotFoundError();
    }

    return {
      branchId: input.branchId,
      shiftId: shift.id,
      shiftStartTime: shift.start_time,
      shiftEndTime: shift.end_time,
    };
  }

  /**
   * An employee clocks in at the branch they belong to and against the ca they are scheduled for.
   *
   * The assignment is what names the ca ( `attendance.shift_id` is what tells two ca of one business day
   * apart) and what carries the hours the lateness verdict needs. An assignment at another branch is
   * refused with `403`: `attendance_insert_own` compares the row's branch with `current_branch_id()`, so
   * it would be an insert the database rejects.
   */
  private async resolveEmployeeTarget(
    input: RecordCheckInUseCaseInput,
    workDate: string,
  ): Promise<CheckInTarget> {
    if (input.callerBranchId === null) {
      throw new AttendanceBranchNotAssignedError();
    }

    if (input.shiftId === null) {
      throw new AttendanceNoShiftTodayError();
    }

    const assignments = await this.shiftAssignmentRepository.findAll({
      employeeId: input.callerId,
      startDate: workDate,
      endDate: workDate,
    });

    const assignment = assignments.find(
      (row) => row.shift_id === input.shiftId && row.status === "SCHEDULED",
    );

    if (!assignment) {
      throw new AttendanceNoShiftTodayError();
    }

    if (assignment.branch_id !== input.callerBranchId) {
      throw new BranchForbiddenError();
    }

    return {
      branchId: assignment.branch_id,
      shiftId: assignment.shift_id,
      shiftStartTime: assignment.shift?.start_time ?? null,
      shiftEndTime: assignment.shift?.end_time ?? null,
    };
  }

  /**
   * The row this check-in would duplicate: the caller's own row for the same ca and business day.
   *
   * `attendance_employee_shift_day_idx` is unique on `(employee_id, work_date, shift_id)`, but Postgres
   * treats NULLs as distinct, so an unscheduled row is not covered by the index — the null-safe
   * comparison here is what protects that case, exactly as SCRUM-21 notes.
   */
  private async findExisting(
    employeeId: string,
    workDate: string,
    shiftId: string | null,
  ): Promise<Attendance | null> {
    const rows = await this.attendanceRepository.findAll({
      employeeId,
      startDate: workDate,
      endDate: workDate,
    });

    return rows.find((row) => (row.shift_id ?? null) === shiftId) ?? null;
  }
}
