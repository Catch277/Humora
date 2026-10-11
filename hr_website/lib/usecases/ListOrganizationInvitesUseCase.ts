import type { OrganizationInvite } from "@/lib/domain/entities/OrganizationInvite";
import { OrganizationForbiddenError } from "@/lib/domain/errors/OrganizationForbiddenError";
import { OrganizationNotFoundError } from "@/lib/domain/errors/OrganizationNotFoundError";
import type { IOrganizationInviteRepository } from "@/lib/domain/repositories/IOrganizationInviteRepository";
import type { IOrganizationRepository } from "@/lib/domain/repositories/IOrganizationRepository";
import { isOwnerRole } from "@/lib/domain/roles";

export type ListOrganizationInvitesInput = {
  callerRole: string;
};

export class ListOrganizationInvitesUseCase {
  constructor(
    private readonly organizationRepository: IOrganizationRepository,
    private readonly inviteRepository: IOrganizationInviteRepository,
  ) {}

  async execute(input: ListOrganizationInvitesInput): Promise<OrganizationInvite[]> {
    if (!isOwnerRole(input.callerRole)) {
      throw new OrganizationForbiddenError();
    }

    const organization = await this.organizationRepository.findCurrent();

    if (!organization) {
      throw new OrganizationNotFoundError();
    }

    return this.inviteRepository.findAll(organization.id);
  }
}