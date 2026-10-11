import type { Shift } from "@/lib/domain/entities/Shift";

/**
 * Chuyển ca (SCRUM-23): an employee hands one of their assigned shifts to a colleague.
 *
 *   PENDING   waiting for the colleague
 *   ACCEPTED  the colleague agreed, waiting for the manager
 *   APPROVED  the manager approved and the assignment moved to the colleague
 *   REJECTED  declined by the colleague or by the manager
 *   CANCELLED withdrawn by the requester
 *
 * Values mirror the check constraint in `SCRUM-23_shift_registration_swap.sql`.
 */
export const SHIFT_SWAP_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;

export type ShiftSwapStatus = (typeof SHIFT_SWAP_STATUSES)[number];

export interface ShiftSwapAssignment {
  id: string;
  work_date: string;
  shift: Shift | null;
}

export interface ShiftSwap {
  id: string;
  branch_id: string;
  assignment_id: string;
  requester_id: string;
  target_employee_id: string;
  reason: string | null;
  status: ShiftSwapStatus;
  target_responded_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
  /** Hydrated from the foreign keys; null when RLS hides the related row. */
  requester: { id: string; full_name: string } | null;
  target_employee: { id: string; full_name: string } | null;
  assignment: ShiftSwapAssignment | null;
}

/** The requester comes from the session, never from the payload. */
export interface RequestShiftSwapInput {
  assignmentId: string;
  targetEmployeeId: string;
  reason: string | null;
}

export interface ShiftSwapFilters {
  branchId?: string;
  status?: ShiftSwapStatus;
  /** Swaps where this person is the requester or the colleague. */
  involvingEmployeeId?: string;
}

export interface ReviewShiftSwapInput {
  approve: boolean;
  rejectReason: string | null;
}

export function isShiftSwapStatus(value: unknown): value is ShiftSwapStatus {
  return (
    typeof value === "string" &&
    (SHIFT_SWAP_STATUSES as readonly string[]).includes(value)
  );
}
