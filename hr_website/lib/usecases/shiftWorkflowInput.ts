import { MAX_SHIFT_NOTE_LENGTH } from "@/lib/domain/entities/ShiftRegistration";
import { ShiftWorkflowForbiddenError } from "@/lib/domain/errors/ShiftWorkflowForbiddenError";
import { ShiftWorkflowInputError } from "@/lib/domain/errors/ShiftWorkflowInputError";
import { MANAGER_ROLES, normalizeRole } from "@/lib/domain/roles";
import { getBusinessDay } from "@/lib/usecases/businessDay";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new ShiftWorkflowInputError(`${label} must be a UUID.`);
  }
}

/** A real calendar date in `YYYY-MM-DD` (so `2026-02-30` is refused, not silently rolled over). */
export function assertDate(value: string, label: string): void {
  const parsed = new Date(`${value}T00:00:00Z`);

  if (
    !DATE_PATTERN.test(value) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new ShiftWorkflowInputError(`${label} must be a date (YYYY-MM-DD).`);
  }
}

/** Today in business time, or later: a shift that has already been worked cannot be requested. */
export function assertNotInThePast(workDate: string, now: Date): void {
  if (workDate < getBusinessDay(now)) {
    throw new ShiftWorkflowInputError("work_date must be today or later.");
  }
}

/** Trims; empty becomes `null`; refuses text longer than the column's intended limit. */
export function normalizeShiftNote(
  value: string | null | undefined,
  label: string,
): string | null {
  const text = value?.trim() || null;

  if (text && text.length > MAX_SHIFT_NOTE_LENGTH) {
    throw new ShiftWorkflowInputError(
      `${label} must be at most ${MAX_SHIFT_NOTE_LENGTH} characters.`,
    );
  }

  return text;
}

export function assertManagerRole(role: string): void {
  if (!MANAGER_ROLES.has(normalizeRole(role))) {
    throw new ShiftWorkflowForbiddenError(
      "Only the owner or a manager may review shift requests.",
    );
  }
}

/** A manager's decision: a rejection must say why, an approval carries no reason. */
export function normalizeDecision(
  approve: boolean,
  rejectReason: string | null | undefined,
): string | null {
  if (approve) {
    return null;
  }

  const reason = normalizeShiftNote(rejectReason, "reject_reason");

  if (!reason) {
    throw new ShiftWorkflowInputError("A reason is required to reject a request.");
  }

  return reason;
}
