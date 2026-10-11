import type { Organization } from "@/lib/domain/entities/Organization";
import type { IOrganizationRepository } from "@/lib/domain/repositories/IOrganizationRepository";

const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 120;

export type CreateOrganizationInput = {
  name: string;
};

export class CreateOrganizationUseCase {
  constructor(
    private readonly organizationRepository: IOrganizationRepository,
  ) {}

  async execute(input: CreateOrganizationInput): Promise<Organization> {
    const name = input.name.trim();

    if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) {
      throw new Error(
        `name must be between ${MIN_NAME_LENGTH} and ${MAX_NAME_LENGTH} characters.`,
      );
    }

    // Who becomes OWNER — the caller — and the "one organization per account" rule are decided by
    // the `create_organization` RPC, because a signed-in caller cannot write their own `users` row.
    return this.organizationRepository.create(name);
  }
}