import type { InviteRole } from "@/lib/domain/entities/OrganizationInvite";
import type { StaffProvisionResult } from "@/lib/domain/entities/StaffProvisionResult";
import type { StaffProvisioningAvailability } from "@/lib/domain/entities/StaffProvisioningAvailability";

/**
 * The privileged half of SCRUM-52: creating a Supabase Auth account for someone else needs the
 * service-role key, which only the `staff-account` Edge Function holds. The web app calls it with
 * the *caller's* access token and never sees a secret.
 */
export interface IStaffProvisioningService {
  /**
   * Reports whether the function can be used, and why not when it cannot. The distinction matters on
   * screen: "not deployed" is an operator task, "not allowed" is a role or organization problem, and
   * "misconfigured" means the function is there but failing.
   */
  checkAvailability(callerToken: string): Promise<StaffProvisioningAvailability>;
  createAccount(input: {
    callerToken: string;
    email: string;
    fullName: string;
    role: InviteRole;
    password: string;
  }): Promise<StaffProvisionResult>;
  /** Gives an existing member of the organization a new temporary password. */
  resetPassword(input: {
    callerToken: string;
    userId: string;
    password: string;
  }): Promise<StaffProvisionResult>;
}