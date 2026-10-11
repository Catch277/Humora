export interface Branch {
  id: string;
  name: string;
  /**
   * The branch's own number inside the organization (SCRUM-67): `1`, `2`, … handed out once when the
   * branch is created and never reused, which is what makes it stable — renaming a branch does not move
   * it and deleting one does not renumber the others. It prefixes every asset code of the branch
   * (`01HSVH-0001`), so the tag always says which branch the device belongs to even when two branches
   * abbreviate to the same letters. `null` for a branch created before `SCRUM-67`; its tags fall back to
   * the bare acronym.
   */
  asset_prefix: number | null;
  address: string | null;
  manager_id: string | null;
  latitude: number | null;
  longitude: number | null;
  attendance_radius: number;
  created_at: string;
  updated_at: string;
}

export interface CreateBranchInput {
  name: string;
  address: string | null;
  managerId: string | null;
  latitude: number | null;
  longitude: number | null;
  attendanceRadius: number;
}

export interface UpdateBranchInput {
  name: string;
  address: string | null;
  managerId: string | null;
  latitude: number | null;
  longitude: number | null;
  attendanceRadius: number;
}

/**
 * How much operational data still points at one branch (SCRUM-61). All four are zero for a branch that
 * may be deleted: `attendance`, `shift_assignments` and `facilities` would cascade away with it, and
 * `daily_revenue` counts rows whose `branch_id` has no foreign key, so deleting would orphan them.
 */
export interface BranchDependents {
  attendance: number;
  assignments: number;
  facilities: number;
  revenue: number;
}

/** True when the branch holds nothing that a delete would destroy or orphan. */
export function isBranchEmpty(dependents: BranchDependents): boolean {
  return (
    dependents.attendance === 0 &&
    dependents.assignments === 0 &&
    dependents.facilities === 0 &&
    dependents.revenue === 0
  );
}
