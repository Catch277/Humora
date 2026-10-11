export class StaffProvisioningForbiddenError extends Error {
  constructor() {
    super(
      "Only an OWNER of the organization may manage staff accounts.",
    );
    this.name = "StaffProvisioningForbiddenError";
  }
}