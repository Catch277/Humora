export class OrganizationInviteNotFoundError extends Error {
  constructor() {
    super("Không tìm thấy lời mời.");
    this.name = "OrganizationInviteNotFoundError";
  }
}