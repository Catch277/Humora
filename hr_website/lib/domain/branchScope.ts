import { isOwnerRole } from "@/lib/domain/roles";

/**
 * Who may manage which branch (SCRUM-61) — one predicate, read by both the use cases (which answer
 * `403`) and the screens (which gray the branch out), so a manager's scope can never drift between the
 * two. The database expresses the same rule in SQL through `public.heads_branch()`.
 *
 * The rule itself: the organization's `OWNER` works across every branch; a `MANAGER` only the branch
 * whose `manager_id` is their own account — including the case where they head none, which means they
 * manage nothing until the owner assigns them a branch. An `EMPLOYEE` manages none of them (their own
 * rows are granted by the employee policies, not by this one).
 */
export type BranchViewer = {
  userId: string | null;
  /** `OWNER`: the whole organization. Anything else: only the branch they head. */
  managesAllBranches: boolean;
};

/** The fields of a branch this rule needs. Structural, so a screen can pass its own row type. */
export type ScopedBranch = {
  id: string;
  manager_id: string | null;
};

/** `BranchViewer` for a role coming from a session, a JWT or a request body. */
export function viewerFromRole(
  role: string | null | undefined,
  userId: string | null,
): BranchViewer {
  return { userId, managesAllBranches: isOwnerRole(role) };
}

export function canManageBranch(
  branch: ScopedBranch | null | undefined,
  viewer: BranchViewer,
): boolean {
  if (!branch) {
    return false;
  }

  if (viewer.managesAllBranches) {
    return true;
  }

  return viewer.userId !== null && branch.manager_id === viewer.userId;
}

/**
 * The branch a screen should open on: the first one the viewer may manage, so a branch head lands on
 * their own branch instead of whichever row the API happened to sort first. Falls back to the first
 * visible branch (the owner case, or a manager who heads none yet) and to `""` when there is none.
 */
export function defaultBranchId(
  branches: readonly ScopedBranch[],
  viewer: BranchViewer,
): string {
  const manageable = branches.find((branch) => canManageBranch(branch, viewer));

  return (manageable ?? branches[0])?.id ?? "";
}
