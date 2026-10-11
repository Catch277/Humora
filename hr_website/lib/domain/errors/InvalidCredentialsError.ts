export class InvalidCredentialsError extends Error {
  constructor() {
    // Deliberately vague: Supabase answers the same way for a wrong password and for an
    // unknown account, and the UI must not reveal which one it was.
    super("Invalid email or password.");
    this.name = "InvalidCredentialsError";
  }
}
