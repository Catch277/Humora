export class QuickSearchForbiddenError extends Error {
  constructor() {
    super("Cần hồ sơ người dùng có vai trò để tìm kiếm.");
    this.name = "QuickSearchForbiddenError";
  }
}
