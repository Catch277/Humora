import type { Attendance } from "@/lib/domain/entities/Attendance";
import type { CheckInInput } from "@/lib/domain/entities/AttendanceClock";
import { AttendanceAlreadyCheckedInError } from "@/lib/domain/errors/AttendanceAlreadyCheckedInError";
import { AttendanceAmbiguousShiftError } from "@/lib/domain/errors/AttendanceAmbiguousShiftError";
import { AttendanceNoAssignmentError } from "@/lib/domain/errors/AttendanceNoAssignmentError";
import type { IAttendanceClockRepository } from "@/lib/domain/repositories/IAttendanceClockRepository";
import type { IShiftAssignmentRepository } from "@/lib/domain/repositories/IShiftAssignmentRepository";
import {
  getShiftWindow,
  normalizeClockPoint,
  resolveCheckInStatus,
} from "@/lib/usecases/attendanceClock";
import { getBusinessDay } from "@/lib/usecases/businessDay";

export type CheckInCommand = CheckInInput & { employeeId: string };

/**
 * Vào ca (SCRUM-22). The rule that makes this more than an insert is "kiểm tra ca được xếp": an
 * employee can only clock in for a shift the schedule gave them today — never for an arbitrary
 * branch or shift. The branch and the shift come from that assignment, not from the request.
 */
export class CheckInUseCase {
  constructor(
    private readonly clockRepository: IAttendanceClockRepository,
    private readonly shiftAssignmentRepository: IShiftAssignmentRepository,
  ) {}

  async execute(command: CheckInCommand, now: Date = new Date()): Promise<Attendance> {
    const point = normalizeClockPoint(command);
    const workDate = getBusinessDay(now);

    // Reads are narrowed to the caller's own rows by RLS, but the filter is explicit as well.
    const assignments = (
      await this.shiftAssignmentRepository.findAll({
        employeeId: command.employeeId,
        startDate: workDate,
        endDate: workDate,
      })
    ).filter(
      (assignment) =>
        assignment.status === "SCHEDULED" &&
        getShiftWindow(workDate, assignment.shift) !== null,
    );

    if (assignments.length === 0) {
      throw new AttendanceNoAssignmentError();
    }

    let assignment = assignments[0];

    if (command.assignmentId) {
      const chosen = assignments.find((item) => item.id === command.assignmentId);

      if (!chosen) {
        // Somebody else's, another day's, or a day off: all look the same to the caller.
        throw new AttendanceNoAssignmentError();
      }

      assignment = chosen;
    } else if (assignments.length > 1) {
      throw new AttendanceAmbiguousShiftError();
    }

    const existing = await this.clockRepository.findByEmployeeAndDate(
      command.employeeId,
      workDate,
    );

    if (existing.some((record) => record.shift_id === assignment.shift_id)) {
      throw new AttendanceAlreadyCheckedInError();
    }

    return this.clockRepository.insertCheckIn({
      employeeId: command.employeeId,
      branchId: assignment.branch_id,
      shiftId: assignment.shift_id,
      workDate,
      checkInAt: now.toISOString(),
      latitude: point.latitude,
      longitude: point.longitude,
      photoUrl: point.photoUrl,
      note: point.note,
      status: resolveCheckInStatus(now, getShiftWindow(workDate, assignment.shift)),
    });
  }
}
