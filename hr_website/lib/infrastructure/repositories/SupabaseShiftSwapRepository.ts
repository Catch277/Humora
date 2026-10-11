import type {
  RequestShiftSwapInput,
  ReviewShiftSwapInput,
  ShiftSwap,
  ShiftSwapFilters,
  ShiftSwapStatus,
} from "@/lib/domain/entities/ShiftSwap";
import { ShiftSwapNotFoundError } from "@/lib/domain/errors/ShiftSwapNotFoundError";
import type { IShiftSwapRepository } from "@/lib/domain/repositories/IShiftSwapRepository";
import { throwShiftWorkflowError } from "@/lib/infrastructure/repositories/shiftWorkflowErrors";
import {
  toShift,
  type ShiftRow,
} from "@/lib/infrastructure/repositories/SupabaseShiftRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

/**
 * `users` is embedded twice (`requester_id`, `target_employee_id`) and the table also has
 * `reviewed_by`, so every embed names its foreign key (PGRST201 otherwise).
 */
const SWAP_COLUMNS = [
  "id",
  "branch_id",
  "assignment_id",
  "requester_id",
  "target_employee_id",
  "reason",
  "status",
  "target_responded_at",
  "reviewed_by",
  "reviewed_at",
  "reject_reason",
  "created_at",
  "updated_at",
  "requester:users!shift_swaps_requester_id_fkey (id, full_name)",
  "target_employee:users!shift_swaps_target_employee_id_fkey (id, full_name)",
  "assignment:shift_assignments (id, work_date, shift:shifts (id, name, branch_id, start_time, end_time))",
].join(", ");

type EmbeddedRow<T> = T | T[] | null;

type SwapRow = {
  id: string;
  branch_id: string;
  assignment_id: string;
  requester_id: string;
  target_employee_id: string;
  reason: string | null;
  status: string;
  target_responded_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
  requester: EmbeddedRow<{ id: string; full_name: string }>;
  target_employee: EmbeddedRow<{ id: string; full_name: string }>;
  assignment: EmbeddedRow<{
    id: string;
    work_date: string;
    shift: EmbeddedRow<ShiftRow>;
  }>;
};

function firstOf<T>(value: EmbeddedRow<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function toSwap(row: SwapRow): ShiftSwap {
  const assignment = firstOf(row.assignment);
  const shift = assignment ? firstOf(assignment.shift) : null;

  return {
    id: row.id,
    branch_id: row.branch_id,
    assignment_id: row.assignment_id,
    requester_id: row.requester_id,
    target_employee_id: row.target_employee_id,
    reason: row.reason,
    status: row.status as ShiftSwapStatus,
    target_responded_at: row.target_responded_at,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    reject_reason: row.reject_reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
    requester: firstOf(row.requester),
    target_employee: firstOf(row.target_employee),
    assignment: assignment
      ? {
          id: assignment.id,
          work_date: assignment.work_date,
          shift: shift ? toShift(shift) : null,
        }
      : null,
  };
}

/**
 * Reads are plain selects (RLS shows the two people involved and managers); every write is one of
 * the `security definer` functions, which re-check who the caller is and whether the schedule still
 * allows the move.
 */
export class SupabaseShiftSwapRepository implements IShiftSwapRepository {
  async findAll(filters: ShiftSwapFilters): Promise<ShiftSwap[]> {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("shift_swaps")
      .select(SWAP_COLUMNS)
      .order("created_at", { ascending: false });

    if (filters.branchId) query = query.eq("branch_id", filters.branchId);
    if (filters.status) query = query.eq("status", filters.status);

    if (filters.involvingEmployeeId) {
      // The id is the session's own UUID, never user text, so it is safe inside the filter string.
      query = query.or(
        `requester_id.eq.${filters.involvingEmployeeId},target_employee_id.eq.${filters.involvingEmployeeId}`,
      );
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Unable to list shift swaps: ${error.message}`);
    }

    return ((data ?? []) as unknown as SwapRow[]).map(toSwap);
  }

  async findById(id: string): Promise<ShiftSwap | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("shift_swaps")
      .select(SWAP_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to read the shift swap: ${error.message}`);
    }

    return data ? toSwap(data as unknown as SwapRow) : null;
  }

  async request(input: RequestShiftSwapInput): Promise<ShiftSwap> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("request_shift_swap", {
      p_assignment_id: input.assignmentId,
      p_target_employee_id: input.targetEmployeeId,
      p_reason: input.reason,
    });

    if (error) {
      // For a request the missing resource is the caller's shift, not a swap.
      throwShiftWorkflowError(
        error,
        new ShiftSwapNotFoundError("Shift assignment not found."),
        "request the shift swap",
      );
    }

    return this.reload((data as { id: string }).id);
  }

  async respond(id: string, accept: boolean): Promise<ShiftSwap> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("respond_shift_swap", {
      p_swap_id: id,
      p_accept: accept,
    });

    if (error) {
      throwShiftWorkflowError(
        error,
        new ShiftSwapNotFoundError(),
        "answer the shift swap",
      );
    }

    return this.reload(id);
  }

  async cancel(id: string): Promise<ShiftSwap> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("cancel_shift_swap", { p_swap_id: id });

    if (error) {
      throwShiftWorkflowError(
        error,
        new ShiftSwapNotFoundError(),
        "cancel the shift swap",
      );
    }

    return this.reload(id);
  }

  async review(id: string, input: ReviewShiftSwapInput): Promise<ShiftSwap> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("review_shift_swap", {
      p_swap_id: id,
      p_approve: input.approve,
      p_reject_reason: input.rejectReason,
    });

    if (error) {
      throwShiftWorkflowError(
        error,
        new ShiftSwapNotFoundError(),
        "review the shift swap",
      );
    }

    return this.reload(id);
  }

  private async reload(id: string): Promise<ShiftSwap> {
    const swap = await this.findById(id);

    if (!swap) {
      throw new ShiftSwapNotFoundError();
    }

    return swap;
  }
}
