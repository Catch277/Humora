export class OrganizationForbiddenError extends Error {
  constructor() {
    super("Chỉ chủ sở hữu tổ chức mới làm được việc này.");
    this.name = "OrganizationForbiddenError";
  }
}