import type { BranchDependents } from "@/lib/domain/entities/Branch";

/**
 * A branch that still holds operational history cannot be deleted (SCRUM-61): `attendance`,
 * `shift_assignments` and `facilities` are `on delete cascade`, so they would disappear with it, and
 * `daily_revenue.branch_id` has no foreign key at all — its rows would be orphaned.
 *
 * Answers `409`. The counts are part of the sentence so the screen can say what to move or remove
 * first; `branches_guard_delete` repeats the rule in the database, and the repository raises this
 * error without counts when that guard is the one that refused the write.
 */
export class BranchNotEmptyError extends Error {
  constructor(readonly dependents: BranchDependents | null = null) {
    super(
      dependents
        ? "This branch still has data (" +
            `attendance: ${dependents.attendance}, shifts: ${dependents.assignments}, ` +
            `facilities: ${dependents.facilities}, revenue: ${dependents.revenue}). ` +
            "Move or remove it first."
        : "This branch still has data (attendance, shifts, facilities or revenue). Move or remove it first.",
    );
    this.name = "BranchNotEmptyError";
  }
}
