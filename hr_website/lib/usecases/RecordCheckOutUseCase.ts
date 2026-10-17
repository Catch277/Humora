import type { Attendance } from "@/lib/domain/entities/Attendance";
import { AttendanceAlreadyCheckedOutError } from "@/lib/domain/errors/AttendanceAlreadyCheckedOutError";
import { AttendanceCheckInForbiddenError } from "@/lib/domain/errors/AttendanceCheckInForbiddenError";
import { AttendanceCheckOutAmbiguousError } from "@/lib/domain/errors/AttendanceCheckOutAmbiguousError";
import { AttendanceNotCheckedInError } from "@/lib/domain/errors/AttendanceNotCheckedInError";
import type { IAttendanceRepository } from "@/lib/domain/repositories/IAttendanceRepository";
import { isOwnerRole } from "@/lib/domain/roles";
import {
  resolveCheckOutStatus,
  resolveStoredStatus,
} from "@/lib/usecases/attendanceStatus";
import { getBusinessDay } from "@/lib/usecases/businessDay";

/** The caller as the route handler knows it (SCRUM-68); the body never names the employee. */
export type RecordCheckOutUseCaseInput = {
  callerId: string;
  callerRole: string;
  /** One of the caller's own rows of today, to close a specific ca; `null` closes the single open one. */
  attendanceId: string | null;
  /** The GPS point of the departure, or `null` when the device refused to provide one. */
  latitude: number | null;
  longitude: number | null;
};

/**
 * Records one departure (SCRUM-68): sets `check_out_at` (plus the point) on the caller's own row of the
 * current business day.
 *
 * Only today's own rows are considered, and the closing columns are the only ones written: the check-in
 * facts stay exactly as the employee reported them (`attendance_guard_self_update` refuses an employee's
 * edit of those, and the reviewer's correction is what fixes a wrong time, with who and why recorded).
 */
export class RecordCheckOutUseCase {
  constructor(
    private readonly attendanceRepository: IAttendanceRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: RecordCheckOutUseCaseInput): Promise<Attendance> {
    // Same rule as the check-in: the organization's owner does not clock in or out (SCRUM-68).
    if (isOwnerRole(input.callerRole)) {
      throw new AttendanceCheckInForbiddenError();
    }

    const now = this.now();
    const workDate = getBusinessDay(now);

    // `employee_id` is the session, so RLS (which lets a manager read the whole organization) cannot
    // make this return somebody else's row.
    const rows = await this.attendanceRepository.findAll({
      employeeId: input.callerId,
      startDate: workDate,
      endDate: workDate,
    });

    const target =
      input.attendanceId === null
        ? this.pickOpenRow(rows)
        : this.pickNamedRow(rows, input.attendanceId);

    return this.attendanceRepository.checkOut(target.id, {
      checkOutAt: now.toISOString(),
      checkOutLatitude: input.latitude,
      checkOutLongitude: input.longitude,
      // The ca's hours come from the row's own embedded shift. The arrival verdict is re-derived from the
      // giờ vào the row stores rather than trusted from whatever a previous write left there — that is what
      // repairs a row an older check-out had stamped "Về sớm" — and the departure can then only add
      // `EARLY_LEAVE` onto an `ON_TIME` record, so lateness is never erased. A manager's correction is left
      // alone (`resolveStoredStatus` keeps it), which is why this cannot undo somebody's audited fix.
      status: resolveCheckOutStatus(
        now,
        target.shift?.end_time ?? null,
        resolveStoredStatus(target, target.shift?.start_time ?? null),
      ),
    });
  }

  /** The row named by the client, which must be one of today's own rows and still open. */
  private pickNamedRow(rows: Attendance[], attendanceId: string): Attendance {
    const target = rows.find((row) => row.id === attendanceId);

    if (!target || !target.check_in_at) {
      // A wrong id, somebody else's row and "never checked in" are one answer: the record is not there.
      throw new AttendanceNotCheckedInError();
    }

    if (target.check_out_at) {
      throw new AttendanceAlreadyCheckedOutError();
    }

    return target;
  }

  /**
   * The caller's single open row of the day. Two open ca cannot be told apart without being named, so
   * that case asks for `attendance_id` instead of closing whichever row happened to come back first.
   */
  private pickOpenRow(rows: Attendance[]): Attendance {
    const open = rows.filter((row) => row.check_in_at && !row.check_out_at);

    if (open.length === 0) {
      // A closed row explains itself better than "you never checked in".
      if (rows.some((row) => row.check_out_at)) {
        throw new AttendanceAlreadyCheckedOutError();
      }

      throw new AttendanceNotCheckedInError();
    }

    if (open.length > 1) {
      throw new AttendanceCheckOutAmbiguousError();
    }

    return open[0];
  }
}
