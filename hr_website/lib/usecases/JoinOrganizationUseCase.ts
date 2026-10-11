import type { Organization } from "@/lib/domain/entities/Organization";
import type { IOrganizationRepository } from "@/lib/domain/repositories/IOrganizationRepository";

/** Codes are read out loud and typed by hand, so length is checked, not the exact alphabet. */
const CODE_PATTERN = /^[A-Z0-9]{6,12}$/;

export type JoinOrganizationInput = {
  code: string;
};

export class JoinOrganizationUseCase {
  constructor(
    private readonly organizationRepository: IOrganizationRepository,
  ) {}

  async execute(input: JoinOrganizationInput): Promise<Organization> {
    const code = input.code.replace(/\s+/g, "").toUpperCase();

    if (!CODE_PATTERN.test(code)) {
      throw new Error("code must be the code the organization shared with you.");
    }

    // The code alone is not enough: `join_organization` also requires an invite row for the
    // caller's email, which is what keeps an outsider who obtained the code out.
    return this.organizationRepository.join(code);
  }
}