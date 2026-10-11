import type {
  InviteRole,
  OrganizationInvite,
} from "@/lib/domain/entities/OrganizationInvite";
import { INVITE_ROLES } from "@/lib/domain/entities/OrganizationInvite";
import { OrganizationForbiddenError } from "@/lib/domain/errors/OrganizationForbiddenError";
import { OrganizationNotFoundError } from "@/lib/domain/errors/OrganizationNotFoundError";
import type { IOrganizationInviteRepository } from "@/lib/domain/repositories/IOrganizationInviteRepository";
import type { IOrganizationRepository } from "@/lib/domain/repositories/IOrganizationRepository";
import { isOwnerRole } from "@/lib/domain/roles";
import { emailValidationError } from "@/lib/usecases/credentials";
const ROLE_SET: ReadonlySet<string> = new Set(INVITE_ROLES);
const MAX_NAME_LENGTH = 120;

export type CreateOrganizationInviteInput = {
  callerId: string;
  callerRole: string;
  email: string;
  fullName: string | null;
  role: string;
};

/**
 * Adds an already-registered account to the organization's register: the person keeps their own
 * password, and the invite is what makes the join code usable for them (SCRUM-51).
 */
export class CreateOrganizationInviteUseCase {
  constructor(
    private readonly organizationRepository: IOrganizationRepository,
    private readonly inviteRepository: IOrganizationInviteRepository,
  ) {}

  async execute(input: CreateOrganizationInviteInput): Promise<OrganizationInvite> {
    if (!isOwnerRole(input.callerRole)) {
      throw new OrganizationForbiddenError();
    }

    const email = input.email.trim();

    const emailError = emailValidationError(email);

    if (emailError) {
      throw new Error(emailError);
    }

    if (!ROLE_SET.has(input.role)) {
      throw new Error(`role must be one of ${INVITE_ROLES.join(", ")}.`);
    }

    const fullName = input.fullName?.trim() ?? "";

    if (fullName.length > MAX_NAME_LENGTH) {
      throw new Error(`full_name must be at most ${MAX_NAME_LENGTH} characters.`);
    }

    const organization = await this.organizationRepository.findCurrent();

    if (!organization) {
      throw new OrganizationNotFoundError();
    }

    return this.inviteRepository.create({
      organizationId: organization.id,
      email,
      fullName: fullName || null,
      role: input.role as InviteRole,
      invitedBy: input.callerId,
    });
  }
}