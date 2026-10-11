export class OrganizationForbiddenError extends Error {
  constructor() {
    super("Only an OWNER of the organization may do that.");
    this.name = "OrganizationForbiddenError";
  }
}