import type { Shift } from "@/lib/domain/entities/Shift";
import { ShiftOverlapError } from "@/lib/domain/errors/ShiftOverlapError";
import type { IShiftAssignmentRepository } from "@/lib/domain/repositories/IShiftAssignmentRepository";
import { shiftsOverlap } from "@/lib/usecases/shiftAssignmentInput";

export type OverlapCheck = {
  employeeId: string;
  workDate: string;
  shift: Shift;
  /** The assignment being edited, which must not clash with itself. */
  ignoreAssignmentId?: string;
};

/**
 * A person cannot be in two places at once. The same employee may hold several assignments on
 * one day, but not two whose hours overlap: an employee can cover a morning and an evening
 * shift, not two morning shifts. `LEAVE` rows are not work, so they never clash.
 *
 * The database also carries a unique index on (employee_id, work_date, shift_id) for the exact
 * duplicate, which catches concurrent requests this check cannot see.
 */
export async function assertNoOverlappingShift(
  assignmentRepository: IShiftAssignmentRepository,
  check: OverlapCheck,
): Promise<void> {
  const sameDay = await assignmentRepository.findAll({
    employeeId: check.employeeId,
    startDate: check.workDate,
    endDate: check.workDate,
  });

  const clash = sameDay.some(
    (assignment) =>
      assignment.id !== check.ignoreAssignmentId &&
      assignment.status === "SCHEDULED" &&
      assignment.shift !== null &&
      shiftsOverlap(assignment.shift, check.shift),
  );

  if (clash) {
    throw new ShiftOverlapError(check.workDate);
  }
}
