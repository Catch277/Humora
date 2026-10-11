export class OrganizationNotFoundError extends Error {
  constructor() {
    super("The organization was not found.");
    this.name = "OrganizationNotFoundError";
  }
}