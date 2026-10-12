export class AlreadyInOrganizationError extends Error {
  constructor() {
    super("Tài khoản này đã thuộc một tổ chức.");
    this.name = "AlreadyInOrganizationError";
  }
}