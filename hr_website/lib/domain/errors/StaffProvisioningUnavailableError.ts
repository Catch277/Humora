/**
 * The `staff-account` Edge Function is not reachable (not deployed, or the project has no functions
 * URL). The screens degrade to the invite path and point at the README instead of failing silently.
 */
export class StaffProvisioningUnavailableError extends Error {
  constructor() {
    super(
      "The staff account service is not available. Deploy the `staff-account` Edge Function (see the README) or invite an existing account instead.",
    );
    this.name = "StaffProvisioningUnavailableError";
  }
}