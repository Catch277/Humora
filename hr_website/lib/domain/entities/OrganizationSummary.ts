import type { Organization } from "@/lib/domain/entities/Organization";

/**
 * What `/api/organizations/current` answers (SCRUM-51). `code` is null when the caller is not the
 * organization's OWNER (SCRUM-59): the join code is hidden by RLS, and the repository does not work
 * around that.
 */
export interface OrganizationSummary {
  organization: Organization | null;
  code: string | null;
  member_count: number;
  pending_invite_count: number;
}