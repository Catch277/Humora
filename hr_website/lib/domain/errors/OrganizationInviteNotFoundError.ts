export class OrganizationInviteNotFoundError extends Error {
  constructor() {
    super("The invite was not found.");
    this.name = "OrganizationInviteNotFoundError";
  }
}