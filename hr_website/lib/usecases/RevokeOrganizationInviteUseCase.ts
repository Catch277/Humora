import { OrganizationForbiddenError } from "@/lib/domain/errors/OrganizationForbiddenError";
import type { IOrganizationInviteRepository } from "@/lib/domain/repositories/IOrganizationInviteRepository";
import { isOwnerRole } from "@/lib/domain/roles";

export type RevokeOrganizationInviteInput = {
  callerRole: string;
  inviteId: string;
};

/**
 * Withdraws an invite that has not been claimed. Once somebody has joined, removing them is a
 * staff action (`is_active = false` on /staff), not an invite action.
 */
export class RevokeOrganizationInviteUseCase {
  constructor(
    private readonly inviteRepository: IOrganizationInviteRepository,
  ) {}

  async execute(input: RevokeOrganizationInviteInput): Promise<void> {
    if (!isOwnerRole(input.callerRole)) {
      throw new OrganizationForbiddenError();
    }

    await this.inviteRepository.revoke(input.inviteId);
  }
}