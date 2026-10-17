import { canManageBranch, viewerFromRole } from "@/lib/domain/branchScope";
import type { Branch } from "@/lib/domain/entities/Branch";
import { BranchForbiddenError } from "@/lib/domain/errors/BranchForbiddenError";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";

/** Who is asking, as a route handler knows it (`caller.userId` / `caller.role`). */
export type BranchCaller = {
  userId: string;
  role: string;
};

/**
 * The branches a caller may act on (SCRUM-63), as a `Set` of ids for the screens and use cases that
 * have to *filter* a list rather than assert one branch.
 *
 * The owner's scope is every branch — and, unlike a `Set`, it also covers the rows that belong to no
 * branch at all (an employee nobody has assigned yet), which is why `all` is a flag instead of the set
 * holding every id. A manager gets exactly the branches whose `manager_id` is their account; a manager
 * who heads none gets an empty set and therefore sees nothing branch-scoped, which is the rule
 * SCRUM-61 describes.
 */
export type BranchScope = {
  /** `true` for the organization's OWNER: the whole organization, including unassigned rows. */
  all: boolean;
  /** The branches the caller heads; empty when `all` is true. */
  ids: ReadonlySet<string>;
};

export async function branchScopeOf(
  branchRepository: IBranchRepository,
  caller: BranchCaller,
): Promise<BranchScope> {
  const viewer = viewerFromRole(caller.role, caller.userId);

  if (viewer.managesAllBranches) {
    // The owner reads the organization, so the branch list is not even needed.
    return { all: true, ids: new Set<string>() };
  }

  const branches = await branchRepository.findAll();

  return {
    all: false,
    ids: new Set(
      branches
        .filter((branch) => canManageBranch(branch, viewer))
        .map((branch) => branch.id),
    ),
  };
}

/**
 * The branch rule as a use case sees it (SCRUM-61): a write against `branchId` is allowed for the
 * organization's OWNER, and for a MANAGER only when they head that branch.
 *
 * This repeats what RLS does through `public.heads_branch()` on purpose. RLS is still the boundary —
 * a blocked write simply matches no row — but silently matching nothing looks like "not found" to the
 * caller and hides the real reason, so the API answers a `403` naming the rule first.
 *
 * `null` covers a record that lost its branch (`requests.branch_id` is `on delete set null`): nobody
 * heads it, so only the owner may act on it.
 *
 * It returns the branch it validated — `null` in that `branchId === null` case — so a caller that needs
 * the branch itself (SCRUM-66 reads `name` for the asset-code prefix) does not have to fetch it again,
 * and cannot drift into re-implementing the comparison.
 */
export async function assertBranchManagedBy(
  branchRepository: IBranchRepository,
  branchId: string | null,
  caller: BranchCaller,
): Promise<Branch | null> {
  const viewer = viewerFromRole(caller.role, caller.userId);

  if (branchId === null) {
    if (!viewer.managesAllBranches) {
      throw new BranchForbiddenError();
    }

    return null;
  }

  const branch = await branchRepository.findById(branchId);

  if (!branch) {
    // Includes another organization's branch: RLS scopes the read, so it simply does not exist here.
    throw new BranchNotFoundError();
  }

  if (!canManageBranch(branch, viewer)) {
    throw new BranchForbiddenError();
  }

  return branch;
}
