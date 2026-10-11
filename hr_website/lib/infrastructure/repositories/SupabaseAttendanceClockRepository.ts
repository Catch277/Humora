import type { Attendance } from "@/lib/domain/entities/Attendance";
import type {
  CheckOutRecord,
  NewCheckInRecord,
} from "@/lib/domain/entities/AttendanceClock";
import { AttendanceAlreadyCheckedInError } from "@/lib/domain/errors/AttendanceAlreadyCheckedInError";
import { AttendanceAlreadyCheckedOutError } from "@/lib/domain/errors/AttendanceAlreadyCheckedOutError";
import { AttendanceNotFoundError } from "@/lib/domain/errors/AttendanceNotFoundError";
import type { IAttendanceClockRepository } from "@/lib/domain/repositories/IAttendanceClockRepository";
import { SupabaseAttendanceRepository } from "@/lib/infrastructure/repositories/SupabaseAttendanceRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

/** Postgres `unique_violation` — `attendance_employee_shift_day_idx` (SCRUM-21). */
const UNIQUE_VIOLATION = "23505";

/**
 * Writes only the columns the employee is allowed to set. `organization_id` is not sent: it
 * defaults to `current_organization_id()` (SCRUM-53) and `attendance_insert_own` checks it. The
 * distance is not sent either — `attendance_compute_distance` derives it from the coordinates.
 *
 * Reads reuse `SupabaseAttendanceRepository`, so the record handed back has the same shape (names,
 * branch radius, shift hours) as the Bảng công screen.
 */
export class SupabaseAttendanceClockRepository
  implements IAttendanceClockRepository
{
  private readonly reader = new SupabaseAttendanceRepository();

  findByEmployeeAndDate(
    employeeId: string,
    workDate: string,
  ): Promise<Attendance[]> {
    return this.reader.findAll({
      employeeId,
      startDate: workDate,
      endDate: workDate,
    });
  }

  async insertCheckIn(record: NewCheckInRecord): Promise<Attendance> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("attendance")
      .insert({
        employee_id: record.employeeId,
        branch_id: record.branchId,
        shift_id: record.shiftId,
        work_date: record.workDate,
        check_in_at: record.checkInAt,
        check_in_latitude: record.latitude,
        check_in_longitude: record.longitude,
        check_in_photo_url: record.photoUrl,
        note: record.note,
        status: record.status,
      })
      .select("id")
      .single();

    if (error) {
      // Two taps racing past the use case's own duplicate check end up here.
      if (error.code === UNIQUE_VIOLATION) {
        throw new AttendanceAlreadyCheckedInError();
      }

      throw new Error(`Unable to record the check-in: ${error.message}`);
    }

    return this.reload(data.id);
  }

  async completeCheckOut(
    id: string,
    record: CheckOutRecord,
  ): Promise<Attendance> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("attendance")
      .update({
        check_out_at: record.checkOutAt,
        check_out_latitude: record.latitude,
        check_out_longitude: record.longitude,
        check_out_photo_url: record.photoUrl,
        note: record.note,
        status: record.status,
        updated_at: record.checkOutAt,
      })
      .eq("id", id)
      // A second tap must not overwrite the first check-out.
      .is("check_out_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to record the check-out: ${error.message}`);
    }

    if (!data) {
      throw new AttendanceAlreadyCheckedOutError();
    }

    return this.reload(data.id);
  }

  private async reload(id: string): Promise<Attendance> {
    const attendance = await this.reader.findById(id);

    if (!attendance) {
      throw new AttendanceNotFoundError();
    }

    return attendance;
  }
}
