import type {
  StaffMember,
  UpdateStaffInput,
} from "@/lib/domain/entities/StaffMember";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import { StaffForbiddenError } from "@/lib/domain/errors/StaffForbiddenError";
import { StaffNotFoundError } from "@/lib/domain/errors/StaffNotFoundError";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";
import type { IUserRepository } from "@/lib/domain/repositories/IUserRepository";
import { APP_ROLES, isOwnerRole, normalizeRole } from "@/lib/domain/roles";

const ROLE_SET: ReadonlySet<string> = new Set(APP_ROLES);

export type ChangeStaffInput = UpdateStaffInput & {
  staffId: string;
  callerId: string;
  callerRole: string;
};

/**
 * Staff administration (SCRUM-24) — roles, `is_active` and (SCRUM-63) the branch an account belongs
 * to. SCRUM-59 makes it an owner-only action: a manager runs the operation (shifts, timesheet,
 * requests), the owner owns the organization's accounts. `users_update_owners` (SCRUM-24/59) repeats
 * the rule in the database.
 */
export class UpdateStaffUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly branchRepository: IBranchRepository,
  ) {}

  async execute(input: ChangeStaffInput): Promise<StaffMember> {
    const callerRole = normalizeRole(input.callerRole);

    if (!isOwnerRole(callerRole)) {
      throw new StaffForbiddenError();
    }

    if (!ROLE_SET.has(input.role)) {
      throw new Error(`role must be one of ${APP_ROLES.join(", ")}.`);
    }

    const target = await this.userRepository.getById(input.staffId);

    if (!target) {
      throw new StaffNotFoundError();
    }

    const targetRole = normalizeRole(target.role);

    // Handing out or taking away the owner role stays the owner's decision, so the check is repeated
    // here instead of being left to the route: the use case is also what guards an in-process caller.
    if (
      (input.role === "OWNER" || targetRole === "OWNER") &&
      callerRole !== "OWNER"
    ) {
      throw new StaffForbiddenError();
    }

    // Nobody should be able to lock themselves out of the admin app.
    if (
      input.staffId === input.callerId &&
      (input.role !== callerRole || !input.isActive)
    ) {
      throw new Error(
        "You cannot change your own role or deactivate your own account.",
      );
    }

    // SCRUM-63: the organization's OWNER sits above every branch and is never attached to one, so a
    // branch is refused for them rather than stored (and a legacy value is cleared when somebody is
    // promoted to OWNER, which is what keeps the row consistent with the rule `/staff` shows).
    if (input.role === "OWNER" && typeof input.branchId === "string") {
      throw new Error("You cannot assign a branch to the organization's owner.");
    }

    const branchId =
      input.role === "OWNER"
        ? null
        : await this.resolveBranchId(input.branchId, target.branch_id);

    return this.userRepository.update(input.staffId, {
      role: input.role,
      isActive: input.isActive,
      branchId,
    });
  }

  /**
   * SCRUM-63: the branch is what scopes the account, so it has to be a branch this caller can see —
   * RLS scopes the read, so another organization's branch (or an id that does not exist) is simply
   * unknown and answers `BranchNotFoundError` (`400`) instead of an opaque foreign-key failure.
   *
   * An omitted `branchId` keeps the current one: a client that predates the column sends only
   * `role`/`is_active` and must not silently unassign everybody. `null` is the explicit "tháo chi
   * nhánh" value the `/staff` screen sends.
   */
  private async resolveBranchId(
    requested: string | null | undefined,
    current: string | null,
  ): Promise<string | null> {
    if (requested === undefined) {
      return current;
    }

    if (requested === null) {
      return null;
    }

    const branch = await this.branchRepository.findById(requested);

    if (!branch) {
      throw new BranchNotFoundError();
    }

    return requested;
  }
}