import type { Attendance } from "@/lib/domain/entities/Attendance";
import type {
  CheckOutRecord,
  NewCheckInRecord,
} from "@/lib/domain/entities/AttendanceClock";

/**
 * The write side of the timesheet for the employee themselves (SCRUM-22/29). Kept apart from
 * `IAttendanceRepository`, which is the manager's review side, so each stays small.
 */
export interface IAttendanceClockRepository {
  /** The caller's own records for one business day (RLS narrows reads to own rows). */
  findByEmployeeAndDate(
    employeeId: string,
    workDate: string,
  ): Promise<Attendance[]>;
  /** Inserts the check-in row; the database derives the distance from the branch centre. */
  insertCheckIn(record: NewCheckInRecord): Promise<Attendance>;
  /** Completes an existing record with the check-out facts. */
  completeCheckOut(id: string, record: CheckOutRecord): Promise<Attendance>;
}
