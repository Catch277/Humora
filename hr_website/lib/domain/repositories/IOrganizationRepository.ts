import type { Organization } from "@/lib/domain/entities/Organization";

export interface IOrganizationRepository {
  /** The caller's organization, or null while they have not created or joined one. */
  findCurrent(): Promise<Organization | null>;
  /**
   * The join code of the caller's organization, or null when the caller may not see it — RLS gives
   * it to the organization's OWNER only (SCRUM-59), so "not the owner" and "no code yet" are the same
   * answer here.
   */
  findJoinCode(): Promise<string | null>;
  countMembers(): Promise<number>;
  /** Creates the organization and makes the caller its OWNER (SCRUM-51 RPC). */
  create(name: string): Promise<Organization>;
  /** Joins with a code; the database also requires a matching invite for the caller's email. */
  join(code: string): Promise<Organization>;
  rename(organizationId: string, name: string): Promise<Organization>;
  /** OWNER only; the previous code stops working immediately. */
  rotateJoinCode(): Promise<string>;
}