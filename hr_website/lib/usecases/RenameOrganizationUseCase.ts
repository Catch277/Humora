import type { Organization } from "@/lib/domain/entities/Organization";
import { OrganizationForbiddenError } from "@/lib/domain/errors/OrganizationForbiddenError";
import { OrganizationNotFoundError } from "@/lib/domain/errors/OrganizationNotFoundError";
import type { IOrganizationRepository } from "@/lib/domain/repositories/IOrganizationRepository";
import { isOwnerRole } from "@/lib/domain/roles";
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 120;

export type RenameOrganizationInput = {
  callerRole: string;
  name: string;
};

export class RenameOrganizationUseCase {
  constructor(
    private readonly organizationRepository: IOrganizationRepository,
  ) {}

  async execute(input: RenameOrganizationInput): Promise<Organization> {
    if (!isOwnerRole(input.callerRole)) {
      throw new OrganizationForbiddenError();
    }

    const name = input.name.trim();

    if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) {
      throw new Error(
        `name must be between ${MIN_NAME_LENGTH} and ${MAX_NAME_LENGTH} characters.`,
      );
    }

    const organization = await this.organizationRepository.findCurrent();

    if (!organization) {
      throw new OrganizationNotFoundError();
    }

    return this.organizationRepository.rename(organization.id, name);
  }
}