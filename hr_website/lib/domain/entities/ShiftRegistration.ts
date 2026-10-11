import type { Shift } from "@/lib/domain/entities/Shift";

/**
 * Đăng ký ca làm việc (SCRUM-23): an employee asks to work a shift ("Tự đăng ký ca mở"). A manager
 * approves it, and approval creates the `shift_assignments` row inside the database.
 *
 * Values mirror the check constraint in `SCRUM-23_shift_registration_swap.sql`.
 */
export const SHIFT_REGISTRATION_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;

export type ShiftRegistrationStatus =
  (typeof SHIFT_REGISTRATION_STATUSES)[number];

export interface ShiftRegistration {
  id: string;
  employee_id: string;
  branch_id: string;
  shift_id: string;
  work_date: string;
  status: ShiftRegistrationStatus;
  note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
  /** Hydrated from the foreign keys; null when RLS hides the related row. */
  employee: { id: string; full_name: string } | null;
  shift: Shift | null;
}

/**
 * What an employee files. The employee comes from the session and the branch from their profile
 * (`users.branch_id`), so neither is part of the payload.
 */
export interface CreateShiftRegistrationInput {
  shiftId: string;
  workDate: string;
  note: string | null;
}

export interface ShiftRegistrationFilters {
  branchId?: string;
  employeeId?: string;
  status?: ShiftRegistrationStatus;
  startDate?: string;
  endDate?: string;
}

/** A manager's decision; a rejection must carry its reason. */
export interface ReviewShiftRegistrationInput {
  approve: boolean;
  rejectReason: string | null;
}

export const MAX_SHIFT_NOTE_LENGTH = 300;

export function isShiftRegistrationStatus(
  value: unknown,
): value is ShiftRegistrationStatus {
  return (
    typeof value === "string" &&
    (SHIFT_REGISTRATION_STATUSES as readonly string[]).includes(value)
  );
}
