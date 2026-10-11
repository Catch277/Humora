import { BranchManagerNotFoundError } from "@/lib/domain/errors/BranchManagerNotFoundError";
import { BranchManagerRoleError } from "@/lib/domain/errors/BranchManagerRoleError";
import type { IUserRepository } from "@/lib/domain/repositories/IUserRepository";
import { isBranchHeadRole } from "@/lib/domain/roles";

/**
 * A branch manager has to be an account the caller can actually see (SCRUM-47) **and** one that may
 * head a branch at all. The lookup goes through the request-scoped client, so RLS already narrows it
 * to the caller's organization: assigning somebody from another company — or a uuid that does not
 * exist at all — is refused here with a typed error instead of becoming an opaque write failure.
 *
 * SCRUM-63 narrows the role half of the rule to `MANAGER`: the organization's `OWNER` sits above every
 * branch instead of running one, and an `EMPLOYEE` never had a scope. That is the same test the picker
 * applies by not offering them (`isBranchHeadRole`).
 *
 * `null`/absent means "no manager yet", which is a valid state (`Chưa gán`).
 */
export async function assertBranchManagerExists(
  userRepository: IUserRepository,
  managerId: string | null,
): Promise<void> {
  if (!managerId) {
    return;
  }

  const manager = await userRepository.getById(managerId);

  if (!manager) {
    throw new BranchManagerNotFoundError();
  }

  if (!isBranchHeadRole(manager.role)) {
    throw new BranchManagerRoleError();
  }
}
