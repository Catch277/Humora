import type {
  Attendance,
  AttendanceBranch,
  AttendanceCheckInInput,
  AttendanceCheckOutInput,
  AttendanceComplaintStatus,
  AttendanceCorrectionInput,
  AttendanceFilters,
  AttendanceStatus,
} from "@/lib/domain/entities/Attendance";
import { AttendanceAlreadyCheckedInError } from "@/lib/domain/errors/AttendanceAlreadyCheckedInError";
import { AttendanceNotFoundError } from "@/lib/domain/errors/AttendanceNotFoundError";
import type { IAttendanceRepository } from "@/lib/domain/repositories/IAttendanceRepository";
import {
  toShift,
  type ShiftRow,
} from "@/lib/infrastructure/repositories/SupabaseShiftRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

/**
 * `employee`, `branch` and `shift` are embedded resources resolved from the foreign keys, so the
 * Bảng công screen can show a name, the shift hours and the geofence radius in one request.
 *
 * `employee` names its foreign key explicitly: this table points at `users` twice
 * (`employee_id` and `verified_by`), and PostgREST refuses to guess which one an unqualified
 * `users` embed means (PGRST201).
 */
const ATTENDANCE_COLUMNS = [
  "id",
  "employee_id",
  "branch_id",
  "shift_id",
  "work_date",
  "check_in_at",
  "check_out_at",
  "check_in_latitude",
  "check_in_longitude",
  "check_out_latitude",
  "check_out_longitude",
  "check_in_distance_m",
  "check_in_photo_url",
  "check_out_photo_url",
  "worked_seconds",
  "resumed_at",
  "status",
  "note",
  "complaint",
  "complaint_at",
  "complaint_status",
  "complaint_resolved_by",
  "complaint_resolved_at",
  "verified_by",
  "verified_at",
  "corrected_by",
  "corrected_at",
  "correction_reason",
  "created_at",
  "updated_at",
  "employee:users!attendance_employee_id_fkey (id, full_name)",
  "branch:branches (id, name, latitude, longitude, attendance_radius)",
  "shift:shifts (id, name, branch_id, start_time, end_time)",
].join(", ");

/**
 * Row shape as PostgREST returns it. Declared locally because the client has no generated
 * Database type; `double precision`/`integer` columns can arrive as strings and an embedded
 * to-one resource may arrive as an array.
 */
type EmbeddedRow<T> = T | T[] | null;

type BranchRow = {
  id: string;
  name: string;
  latitude: number | string | null;
  longitude: number | string | null;
  attendance_radius: number | string;
};

type AttendanceRow = {
  id: string;
  employee_id: string;
  branch_id: string;
  shift_id: string | null;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_latitude: number | string | null;
  check_in_longitude: number | string | null;
  check_out_latitude: number | string | null;
  check_out_longitude: number | string | null;
  check_in_distance_m: number | string | null;
  check_in_photo_url: string | null;
  check_out_photo_url: string | null;
  worked_seconds: number | string | null;
  resumed_at: string | null;
  status: string;
  note: string | null;
  complaint: string | null;
  complaint_at: string | null;
  complaint_status: string | null;
  complaint_resolved_by: string | null;
  complaint_resolved_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  corrected_by: string | null;
  corrected_at: string | null;
  correction_reason: string | null;
  created_at: string;
  updated_at: string;
  employee: EmbeddedRow<{ id: string; full_name: string }>;
  branch: EmbeddedRow<BranchRow>;
  shift: EmbeddedRow<ShiftRow>;
};

function firstOf<T>(value: EmbeddedRow<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function optionalNumber(value: number | string | null): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function toAttendanceBranch(row: BranchRow): AttendanceBranch {
  return {
    id: row.id,
    name: row.name,
    latitude: optionalNumber(row.latitude),
    longitude: optionalNumber(row.longitude),
    attendance_radius: Number(row.attendance_radius),
  };
}

function toAttendance(row: AttendanceRow): Attendance {
  const employee = firstOf(row.employee);
  const branch = firstOf(row.branch);
  const shift = firstOf(row.shift);

  return {
    id: row.id,
    employee_id: row.employee_id,
    branch_id: row.branch_id,
    shift_id: row.shift_id,
    work_date: row.work_date,
    check_in_at: row.check_in_at,
    check_out_at: row.check_out_at,
    check_in_latitude: optionalNumber(row.check_in_latitude),
    check_in_longitude: optionalNumber(row.check_in_longitude),
    check_out_latitude: optionalNumber(row.check_out_latitude),
    check_out_longitude: optionalNumber(row.check_out_longitude),
    check_in_distance_m: optionalNumber(row.check_in_distance_m),
    check_in_photo_url: row.check_in_photo_url,
    check_out_photo_url: row.check_out_photo_url,
    // `integer` arrives as a string like every other numeric column in this client.
    worked_seconds: Number(row.worked_seconds ?? 0),
    resumed_at: row.resumed_at,
    // The check constraint in SCRUM-21 keeps this inside the union.
    status: row.status as AttendanceStatus,
    note: row.note,
    complaint: row.complaint,
    complaint_at: row.complaint_at,
    complaint_status: row.complaint_status as AttendanceComplaintStatus | null,
    complaint_resolved_by: row.complaint_resolved_by,
    complaint_resolved_at: row.complaint_resolved_at,
    verified_by: row.verified_by,
    verified_at: row.verified_at,
    corrected_by: row.corrected_by,
    corrected_at: row.corrected_at,
    correction_reason: row.correction_reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
    employee: employee
      ? { id: employee.id, full_name: employee.full_name }
      : null,
    branch: branch ? toAttendanceBranch(branch) : null,
    shift: shift ? toShift(shift) : null,
  };
}

export class SupabaseAttendanceRepository implements IAttendanceRepository {
  async findAll(filters: AttendanceFilters): Promise<Attendance[]> {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("attendance")
      .select(ATTENDANCE_COLUMNS)
      .order("work_date", { ascending: false });

    if (filters.branchId) {
      query = query.eq("branch_id", filters.branchId);
    }

    if (filters.employeeId) {
      query = query.eq("employee_id", filters.employeeId);
    }

    if (filters.status) {
      query = query.eq("status", filters.status);
    }

    // `work_date` is a `date` column, so lexical comparison is also chronological.
    if (filters.startDate) {
      query = query.gte("work_date", filters.startDate);
    }

    if (filters.endDate) {
      query = query.lte("work_date", filters.endDate);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Unable to load attendance: ${error.message}`);
    }

    // The embedded resources make PostgREST's inferred row type unusable, so the cast goes
    // through `unknown` and is normalised by `toAttendance` instead.
    return ((data ?? []) as unknown as AttendanceRow[]).map(toAttendance);
  }

  async findById(id: string): Promise<Attendance | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("attendance")
      .select(ATTENDANCE_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load attendance record: ${error.message}`);
    }

    return data ? toAttendance(data as unknown as AttendanceRow) : null;
  }

  async create(input: AttendanceCheckInInput): Promise<Attendance> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("attendance")
      .insert({
        employee_id: input.employeeId,
        branch_id: input.branchId,
        shift_id: input.shiftId,
        work_date: input.workDate,
        check_in_at: input.checkInAt,
        check_in_latitude: input.checkInLatitude,
        check_in_longitude: input.checkInLongitude,
        status: input.status,
        note: input.note,
        // `check_in_distance_m` is not sent: `attendance_compute_distance` (SCRUM-21) derives it from
        // the point, so the two can never disagree. `created_at` / `updated_at` have defaults.
      })
      .select(ATTENDANCE_COLUMNS)
      .single();

    if (error) {
      // `attendance_employee_shift_day_idx` is unique on (employee_id, work_date, shift_id), so two
      // saves racing for the same ca land here; the use case checks the same thing before inserting.
      if (error.code === "23505") {
        throw new AttendanceAlreadyCheckedInError();
      }

      throw new Error(`Unable to record the check-in: ${error.message}`);
    }

    return toAttendance(data as unknown as AttendanceRow);
  }

  async checkOut(id: string, input: AttendanceCheckOutInput): Promise<Attendance> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("attendance")
      .update({
        check_out_at: input.checkOutAt,
        check_out_latitude: input.checkOutLatitude,
        check_out_longitude: input.checkOutLongitude,
        status: input.status,
        updated_at: new Date().toISOString(),
        // The check-in facts stay untouched: `attendance_guard_self_update` (SCRUM-21) would refuse the
        // update for an employee, and the times they reported are the reviewer's evidence.
      })
      .eq("id", id)
      .select(ATTENDANCE_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to record the check-out: ${error.message}`);
    }

    // RLS hides rows the caller may not update, so "no row" covers both a wrong id and a forbidden
    // update — both answer 404 to avoid leaking which ids exist.
    if (!data) {
      throw new AttendanceNotFoundError();
    }

    return toAttendance(data as unknown as AttendanceRow);
  }

  async reopen(id: string, status: AttendanceStatus): Promise<Attendance> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("attendance")
      .update({
        // Only the closing columns are cleared, so an employee's `attendance_guard_self_update` is
        // satisfied: the check-in facts they submitted stay untouched, which is what the reviewer reads.
        check_out_at: null,
        check_out_latitude: null,
        check_out_longitude: null,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(ATTENDANCE_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to re-open the check-in: ${error.message}`);
    }

    if (!data) {
      throw new AttendanceNotFoundError();
    }

    return toAttendance(data as unknown as AttendanceRow);
  }

  async recordComplaint(id: string, complaint: string): Promise<Attendance> {
    const supabase = await createSupabaseServerClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("attendance")
      .update({
        complaint,
        complaint_at: now,
        // A new or re-sent complaint starts open again, whatever happened before.
        complaint_status: "OPEN",
        complaint_resolved_by: null,
        complaint_resolved_at: null,
        updated_at: now,
      })
      .eq("id", id)
      .select(ATTENDANCE_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to record the complaint: ${error.message}`);
    }

    // RLS hides rows the caller may not update, so "no row" covers both a wrong id and a
    // forbidden update — both surface as 404 to avoid leaking which ids exist.
    if (!data) {
      throw new AttendanceNotFoundError();
    }

    return toAttendance(data as unknown as AttendanceRow);
  }

  async verify(id: string, verifierId: string): Promise<Attendance> {
    const supabase = await createSupabaseServerClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("attendance")
      .update({ verified_by: verifierId, verified_at: now, updated_at: now })
      .eq("id", id)
      .select(ATTENDANCE_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Unable to verify the attendance record: ${error.message}`,
      );
    }

    if (!data) {
      throw new AttendanceNotFoundError();
    }

    return toAttendance(data as unknown as AttendanceRow);
  }

  async resolveComplaint(id: string, resolverId: string): Promise<Attendance> {
    const supabase = await createSupabaseServerClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("attendance")
      .update({
        complaint_status: "RESOLVED",
        complaint_resolved_by: resolverId,
        complaint_resolved_at: now,
        updated_at: now,
      })
      .eq("id", id)
      .select(ATTENDANCE_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to resolve the complaint: ${error.message}`);
    }

    if (!data) {
      throw new AttendanceNotFoundError();
    }

    return toAttendance(data as unknown as AttendanceRow);
  }

  async correct(
    id: string,
    input: AttendanceCorrectionInput & {
      correctorId: string;
      correctedAt: string;
    },
  ): Promise<Attendance> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("attendance")
      .update({
        check_in_at: input.checkInAt,
        check_out_at: input.checkOutAt,
        status: input.status,
        note: input.note,
        // Who fixed it, when, and why — the fields payroll audits.
        corrected_by: input.correctorId,
        corrected_at: input.correctedAt,
        correction_reason: input.correctionReason,
        updated_at: input.correctedAt,
      })
      .eq("id", id)
      .select(ATTENDANCE_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to correct the attendance record: ${error.message}`);
    }

    if (!data) {
      throw new AttendanceNotFoundError();
    }

    return toAttendance(data as unknown as AttendanceRow);
  }
}