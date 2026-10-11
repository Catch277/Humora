export class AlreadyInOrganizationError extends Error {
  constructor() {
    super("This account already belongs to an organization.");
    this.name = "AlreadyInOrganizationError";
  }
}