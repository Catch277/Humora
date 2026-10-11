export class StaffProvisioningRateLimitedError extends Error {
  constructor() {
    super(
      "Too many accounts were created for this organization in the last hour. Try again later.",
    );
    this.name = "StaffProvisioningRateLimitedError";
  }
}