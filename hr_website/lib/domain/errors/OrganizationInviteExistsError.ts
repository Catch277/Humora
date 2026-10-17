export class OrganizationInviteExistsError extends Error {
  constructor() {
    super("Email này đã có trong danh sách của tổ chức.");
    this.name = "OrganizationInviteExistsError";
  }
}