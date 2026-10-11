/**
 * The roles an invite may carry — `APP_ROLES` without `OWNER` (`lib/domain/roles.ts`): an invite can
 * never mint an owner, only an existing `OWNER` grants that role (SCRUM-24). SCRUM-59 renamed the
 * middle level from `CHU` to `MANAGER`.
 */
export const INVITE_ROLES = ["EMPLOYEE", "MANAGER"] as const;

export type InviteRole = (typeof INVITE_ROLES)[number];

export const INVITE_SOURCES = ["invite", "provisioned"] as const;

export type InviteSource = (typeof INVITE_SOURCES)[number];

/**
 * A row of the organization's register of accounts (SCRUM-51): either `provisioned` — an owner
 * created the Supabase Auth account and handed over a temporary password (SCRUM-52) — or `invite`
 * — an already-registered account was asked to join. Claimed rows have `claimed_by`/`claimed_at`.
 */
export interface OrganizationInvite {
  id: string;
  organization_id: string;
  email: string;
  full_name: string | null;
  role: string;
  source: string;
  invited_by: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
}