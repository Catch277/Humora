export class QuickSearchForbiddenError extends Error {
  constructor() {
    super("A user profile with a role is required to search.");
    this.name = "QuickSearchForbiddenError";
  }
}
