import type {
  CreateShiftAssignmentInput,
  ShiftAssignment,
  ShiftAssignmentFilters,
  ShiftAssignmentStatus,
  UpdateShiftAssignmentInput,
} from "@/lib/domain/entities/Shift";
import { ShiftAssignmentNotFoundError } from "@/lib/domain/errors/ShiftAssignmentNotFoundError";
import { ShiftOverlapError } from "@/lib/domain/errors/ShiftOverlapError";
import type { IShiftAssignmentRepository } from "@/lib/domain/repositories/IShiftAssignmentRepository";
import {
  toShift,
  type ShiftRow,
} from "@/lib/infrastructure/repositories/SupabaseShiftRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

/**
 * `employee` and `shift` are embedded resources resolved from the foreign keys, so the
 * schedule screen gets names without a second round trip (and without a staff-list endpoint).
 */
/**
 * `employee` and `shift` are embedded resources resolved from the foreign keys, so the schedule
 * screen gets names without a second round trip (and without a staff-list endpoint).
 *
 * `employee` names its foreign key explicitly: this table points at `users` twice
 * (`employee_id` and `created_by`), and PostgREST refuses to guess which one an unqualified
 * `users` embed means (PGRST201).
 */
const ASSIGNMENT_COLUMNS = [
  "id",
  "employee_id",
  "branch_id",
  "shift_id",
  "work_date",
  "status",
  "note",
  "created_at",
  "updated_at",
  "employee:users!shift_assignments_employee_id_fkey (id, full_name)",
  "shift:shifts (id, name, branch_id, start_time, end_time)",
].join(", ");

/**
 * Row shape as PostgREST returns it. A to-one embedding normally arrives as an object, but
 * PostgREST falls back to an array when it cannot prove the cardinality, so both are handled.
 */
type EmbeddedRow<T> = T | T[] | null;

type AssignmentRow = {
  id: string;
  employee_id: string;
  branch_id: string;
  shift_id: string;
  work_date: string;
  status: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  employee: EmbeddedRow<{ id: string; full_name: string }>;
  shift: EmbeddedRow<ShiftRow>;
};

function firstOf<T>(value: EmbeddedRow<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function toAssignment(row: AssignmentRow): ShiftAssignment {
  const employee = firstOf(row.employee);
  const shift = firstOf(row.shift);

  return {
    id: row.id,
    employee_id: row.employee_id,
    branch_id: row.branch_id,
    shift_id: row.shift_id,
    work_date: row.work_date,
    // The check constraint in SCRUM-30 keeps this inside the union.
    status: row.status as ShiftAssignmentStatus,
    note: row.note,
    created_at: row.created_at,
    updated_at: row.updated_at,
    // A hidden related row (RLS) comes back as null instead of failing the query.
    employee: employee ? { id: employee.id, full_name: employee.full_name } : null,
    shift: shift ? toShift(shift) : null,
  };
}

export class SupabaseShiftAssignmentRepository
  implements IShiftAssignmentRepository
{
  async findAll(filters: ShiftAssignmentFilters): Promise<ShiftAssignment[]> {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("shift_assignments")
      .select(ASSIGNMENT_COLUMNS)
      .order("work_date", { ascending: true });

    if (filters.branchId) {
      query = query.eq("branch_id", filters.branchId);
    }

    if (filters.employeeId) {
      query = query.eq("employee_id", filters.employeeId);
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
      throw new Error(`Unable to load shift assignments: ${error.message}`);
    }

    // The embedded resources make PostgREST's inferred row type unusable, so the cast goes
    // through `unknown` and is validated by `toAssignment` instead.
    return ((data ?? []) as unknown as AssignmentRow[]).map(toAssignment);
  }

  async findById(id: string): Promise<ShiftAssignment | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("shift_assignments")
      .select(ASSIGNMENT_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load the shift assignment: ${error.message}`);
    }

    // RLS scopes the read (SCRUM-60: own shifts, or a manager), so a hidden row is simply "no shift".
    return data ? toAssignment(data as unknown as AssignmentRow) : null;
  }

  async create(input: CreateShiftAssignmentInput): Promise<ShiftAssignment> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("shift_assignments")
      .insert({
        employee_id: input.employeeId,
        branch_id: input.branchId,
        shift_id: input.shiftId,
        work_date: input.workDate,
        status: input.status,
        note: input.note,
      })
      .select(ASSIGNMENT_COLUMNS)
      .single();

    if (error) {
      // The unique index on (employee_id, work_date, shift_id) is the database's answer to
      // "this person already has this exact shift that day", including on a race the use
      // case's overlap check cannot see.
      if (error.code === "23505") {
        throw new ShiftOverlapError(input.workDate);
      }

      throw new Error(`Unable to create shift assignment: ${error.message}`);
    }

    return toAssignment(data as unknown as AssignmentRow);
  }

  async update(
    id: string,
    input: UpdateShiftAssignmentInput,
  ): Promise<ShiftAssignment> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("shift_assignments")
      .update({
        employee_id: input.employeeId,
        branch_id: input.branchId,
        shift_id: input.shiftId,
        work_date: input.workDate,
        status: input.status,
        note: input.note,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(ASSIGNMENT_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to update shift assignment: ${error.message}`);
    }

    // RLS hides rows the caller may not update, so "no row" covers both a wrong id and a
    // forbidden update — both surface as 404 to avoid leaking which ids exist.
    if (!data) {
      throw new ShiftAssignmentNotFoundError();
    }

    return toAssignment(data as unknown as AssignmentRow);
  }

  async delete(id: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("shift_assignments")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to delete shift assignment: ${error.message}`);
    }

    if (!data) {
      throw new ShiftAssignmentNotFoundError();
    }
  }
}
