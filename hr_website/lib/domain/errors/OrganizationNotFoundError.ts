export class OrganizationNotFoundError extends Error {
  constructor() {
    super("Không tìm thấy tổ chức.");
    this.name = "OrganizationNotFoundError";
  }
}