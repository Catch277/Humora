import type {
  CreateShiftRegistrationInput,
  ReviewShiftRegistrationInput,
  ShiftRegistration,
  ShiftRegistrationFilters,
  ShiftRegistrationStatus,
} from "@/lib/domain/entities/ShiftRegistration";
import { ShiftRegistrationNotFoundError } from "@/lib/domain/errors/ShiftRegistrationNotFoundError";
import { ShiftWorkflowStateError } from "@/lib/domain/errors/ShiftWorkflowStateError";
import type { IShiftRegistrationRepository } from "@/lib/domain/repositories/IShiftRegistrationRepository";
import { throwShiftWorkflowError } from "@/lib/infrastructure/repositories/shiftWorkflowErrors";
import {
  toShift,
  type ShiftRow,
} from "@/lib/infrastructure/repositories/SupabaseShiftRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

/**
 * `employee` names its foreign key: the table points at `users` twice (`employee_id` and
 * `reviewed_by`) and PostgREST refuses to guess (PGRST201) — same as `shift_assignments`.
 */
const REGISTRATION_COLUMNS = [
  "id",
  "employee_id",
  "branch_id",
  "shift_id",
  "work_date",
  "status",
  "note",
  "reviewed_by",
  "reviewed_at",
  "reject_reason",
  "created_at",
  "updated_at",
  "employee:users!shift_registrations_employee_id_fkey (id, full_name)",
  "shift:shifts (id, name, branch_id, start_time, end_time)",
].join(", ");

type EmbeddedRow<T> = T | T[] | null;

type RegistrationRow = {
  id: string;
  employee_id: string;
  branch_id: string;
  shift_id: string;
  work_date: string;
  status: string;
  note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
  employee: EmbeddedRow<{ id: string; full_name: string }>;
  shift: EmbeddedRow<ShiftRow>;
};

function firstOf<T>(value: EmbeddedRow<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function toRegistration(row: RegistrationRow): ShiftRegistration {
  const shift = firstOf(row.shift);

  return {
    id: row.id,
    employee_id: row.employee_id,
    branch_id: row.branch_id,
    shift_id: row.shift_id,
    work_date: row.work_date,
    status: row.status as ShiftRegistrationStatus,
    note: row.note,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    reject_reason: row.reject_reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
    employee: firstOf(row.employee),
    shift: shift ? toShift(shift) : null,
  };
}

export class SupabaseShiftRegistrationRepository
  implements IShiftRegistrationRepository
{
  async findAll(filters: ShiftRegistrationFilters): Promise<ShiftRegistration[]> {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("shift_registrations")
      .select(REGISTRATION_COLUMNS)
      .order("work_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (filters.branchId) query = query.eq("branch_id", filters.branchId);
    if (filters.employeeId) query = query.eq("employee_id", filters.employeeId);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.startDate) query = query.gte("work_date", filters.startDate);
    if (filters.endDate) query = query.lte("work_date", filters.endDate);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Unable to list shift registrations: ${error.message}`);
    }

    return ((data ?? []) as unknown as RegistrationRow[]).map(toRegistration);
  }

  async findById(id: string): Promise<ShiftRegistration | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("shift_registrations")
      .select(REGISTRATION_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to read the shift registration: ${error.message}`);
    }

    return data ? toRegistration(data as unknown as RegistrationRow) : null;
  }

  async create(
    input: CreateShiftRegistrationInput & { employeeId: string; branchId: string },
  ): Promise<ShiftRegistration> {
    const supabase = await createSupabaseServerClient();
    // `organization_id` is not sent: it defaults to `current_organization_id()` and the insert
    // policy checks it, the employee, the branch and the PENDING status.
    const { data, error } = await supabase
      .from("shift_registrations")
      .insert({
        employee_id: input.employeeId,
        branch_id: input.branchId,
        shift_id: input.shiftId,
        work_date: input.workDate,
        note: input.note,
        status: "PENDING",
      })
      .select("id")
      .single();

    if (error) {
      throwShiftWorkflowError(
        error,
        new ShiftRegistrationNotFoundError(),
        "create the shift registration",
      );
    }

    return this.reload(data.id);
  }

  async cancel(id: string): Promise<ShiftRegistration> {
    const supabase = await createSupabaseServerClient();
    // The update policy only lets an employee turn their own PENDING row into CANCELLED.
    const { data, error } = await supabase
      .from("shift_registrations")
      .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "PENDING")
      .select("id")
      .maybeSingle();

    if (error) {
      throwShiftWorkflowError(
        error,
        new ShiftRegistrationNotFoundError(),
        "cancel the shift registration",
      );
    }

    if (!data) {
      throw new ShiftWorkflowStateError(
        "Only a pending registration can be cancelled.",
      );
    }

    return this.reload(data.id);
  }

  async review(
    id: string,
    input: ReviewShiftRegistrationInput,
  ): Promise<ShiftRegistration> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("review_shift_registration", {
      p_registration_id: id,
      p_approve: input.approve,
      p_reject_reason: input.rejectReason,
    });

    if (error) {
      throwShiftWorkflowError(
        error,
        new ShiftRegistrationNotFoundError(),
        "review the shift registration",
      );
    }

    return this.reload(id);
  }

  private async reload(id: string): Promise<ShiftRegistration> {
    const registration = await this.findById(id);

    if (!registration) {
      throw new ShiftRegistrationNotFoundError();
    }

    return registration;
  }
}
