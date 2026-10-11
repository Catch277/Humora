import type { Attendance } from "@/lib/domain/entities/Attendance";
import type { CheckOutInput } from "@/lib/domain/entities/AttendanceClock";
import { AttendanceAlreadyCheckedOutError } from "@/lib/domain/errors/AttendanceAlreadyCheckedOutError";
import { AttendanceNotCheckedInError } from "@/lib/domain/errors/AttendanceNotCheckedInError";
import type { IAttendanceClockRepository } from "@/lib/domain/repositories/IAttendanceClockRepository";
import {
  getShiftWindow,
  normalizeClockPoint,
  resolveCheckOutStatus,
} from "@/lib/usecases/attendanceClock";
import { getBusinessDay } from "@/lib/usecases/businessDay";

export type CheckOutCommand = CheckOutInput & { employeeId: string };

/**
 * Ra ca / chấm công cuối ca (SCRUM-29). Completes the caller's own open record of today — the one
 * with a check-in and no check-out. `attendance_guard_self_update` (SCRUM-21) already stops an
 * employee from touching the check-in facts, so only the check-out columns change here.
 *
 * With several open records the most recent check-in is closed first.
 */
export class CheckOutUseCase {
  constructor(private readonly clockRepository: IAttendanceClockRepository) {}

  async execute(command: CheckOutCommand, now: Date = new Date()): Promise<Attendance> {
    const point = normalizeClockPoint(command);
    const workDate = getBusinessDay(now);
    const records = await this.clockRepository.findByEmployeeAndDate(
      command.employeeId,
      workDate,
    );

    const open = records
      .filter((record) => record.check_in_at !== null && record.check_out_at === null)
      .sort(
        (a, b) =>
          new Date(b.check_in_at ?? 0).getTime() -
          new Date(a.check_in_at ?? 0).getTime(),
      )[0];

    if (!open) {
      if (records.some((record) => record.check_out_at !== null)) {
        throw new AttendanceAlreadyCheckedOutError();
      }

      throw new AttendanceNotCheckedInError();
    }

    return this.clockRepository.completeCheckOut(open.id, {
      checkOutAt: now.toISOString(),
      latitude: point.latitude,
      longitude: point.longitude,
      photoUrl: point.photoUrl,
      // Keep the check-in note when the employee adds nothing at check-out.
      note: point.note ?? open.note,
      status: resolveCheckOutStatus(now, getShiftWindow(workDate, open.shift), open.status),
    });
  }
}
