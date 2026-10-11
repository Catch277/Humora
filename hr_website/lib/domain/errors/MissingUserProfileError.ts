/**
 * A signed-in auth account with no `public.users` row (its SCRUM-50 trigger never ran), so it has
 * no role and no organization to act in.
 */
export class MissingUserProfileError extends Error {
  constructor() {
    super("The account has no user profile.");
    this.name = "MissingUserProfileError";
  }
}