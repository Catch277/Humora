import type {
  InviteRole,
  OrganizationInvite,
} from "@/lib/domain/entities/OrganizationInvite";

export interface IOrganizationInviteRepository {
  findAll(organizationId: string): Promise<OrganizationInvite[]>;
  countPending(organizationId: string): Promise<number>;
  create(input: {
    organizationId: string;
    email: string;
    fullName: string | null;
    role: InviteRole;
    invitedBy: string;
  }): Promise<OrganizationInvite>;
  revoke(id: string): Promise<void>;
}