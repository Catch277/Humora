import type { OrganizationSummary } from "@/lib/domain/entities/OrganizationSummary";
import type { IOrganizationInviteRepository } from "@/lib/domain/repositories/IOrganizationInviteRepository";
import type { IOrganizationRepository } from "@/lib/domain/repositories/IOrganizationRepository";

export class GetCurrentOrganizationUseCase {
  constructor(
    private readonly organizationRepository: IOrganizationRepository,
    private readonly inviteRepository: IOrganizationInviteRepository,
  ) {}

  async execute(): Promise<OrganizationSummary> {
    const organization = await this.organizationRepository.findCurrent();

    if (!organization) {
      return {
        organization: null,
        code: null,
        member_count: 0,
        pending_invite_count: 0,
      };
    }

    // All three reads are RLS-scoped: the code comes back null for a non-manager and the invite
    // count stays zero when the policy hides those rows, so the screen needs no role logic.
    const [code, memberCount, pendingInviteCount] = await Promise.all([
      this.organizationRepository.findJoinCode(),
      this.organizationRepository.countMembers(),
      this.inviteRepository.countPending(organization.id),
    ]);

    return {
      organization,
      code,
      member_count: memberCount,
      pending_invite_count: pendingInviteCount,
    };
  }
}