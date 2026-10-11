export class OrganizationInviteExistsError extends Error {
  constructor() {
    super("This email is already on the organization's list.");
    this.name = "OrganizationInviteExistsError";
  }
}