import type {
  CreateShiftAssignmentInput,
  UpdateShiftAssignmentInput,
} from "@/lib/domain/entities/Shift";

/**
 * Trims the note and collapses whitespace so the schedule list stays readable. The route
 * handler has already validated the payload; this only normalises what is persisted.
 */
export function normalizeShiftAssignmentWriteInput<
  T extends CreateShiftAssignmentInput | UpdateShiftAssignmentInput,
>(input: T): T {
  const note = input.note?.trim().replace(/\s+/g, " ");

  return {
    ...input,
    note: note ? note : null,
  };
}

/** `HH:MM:SS` (Postgres `time`) or `HH:MM` → minutes since midnight; null when unusable. */
function toMinutes(time: string | null): number | null {
  if (!time) {
    return null;
  }

  const [hours, minutes] = time.split(":");
  const parsedHours = Number(hours);
  const parsedMinutes = Number(minutes);

  if (!Number.isInteger(parsedHours) || !Number.isInteger(parsedMinutes)) {
    return null;
  }

  return parsedHours * 60 + parsedMinutes;
}

/**
 * Two shifts clash when they share a minute: a shift ending at 13:00 and another starting at
 * 13:00 are back-to-back, not overlapping, so the comparison is strict. A template without
 * both times (e.g. "Nghỉ") or with a zero-length window never clashes.
 */
export function shiftsOverlap(
  first: { start_time: string | null; end_time: string | null },
  second: { start_time: string | null; end_time: string | null },
): boolean {
  const firstStart = toMinutes(first.start_time);
  const firstEnd = toMinutes(first.end_time);
  const secondStart = toMinutes(second.start_time);
  const secondEnd = toMinutes(second.end_time);

  if (
    firstStart === null ||
    firstEnd === null ||
    secondStart === null ||
    secondEnd === null
  ) {
    return false;
  }

  if (firstStart === firstEnd || secondStart === secondEnd) {
    return false;
  }

  return firstStart < secondEnd && secondStart < firstEnd;
}
