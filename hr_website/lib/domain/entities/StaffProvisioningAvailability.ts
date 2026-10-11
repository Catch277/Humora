/** Why the staff-account Edge Function is (not) usable from this deployment (SCRUM-52). */
export const STAFF_PROVISIONING_REASONS = [
  /** The function answered. */
  "ready",
  /** No function at that name, or it could not be reached at all. */
  "not_deployed",
  /** The function rejected the session token — usually "Verify JWT" turned off for it. */
  "unauthenticated",
  /** Deployed and reachable, but this account is not the organization's OWNER (SCRUM-59). */
  "not_allowed",
  /** Deployed and reachable, but the function itself answered 5xx (missing secrets, SQL error). */
  "misconfigured",
  /** Anything else — the HTTP status is in `detail`. */
  "unknown",
] as const;

export type StaffProvisioningReason = (typeof STAFF_PROVISIONING_REASONS)[number];

export interface StaffProvisioningAvailability {
  available: boolean;
  reason: StaffProvisioningReason;
  /** Short explanation from the function (or the transport failure); safe to show a manager. */
  detail: string | null;
}