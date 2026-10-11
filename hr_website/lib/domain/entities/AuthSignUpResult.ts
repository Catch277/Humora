export interface AuthSignUpResult {
  userId: string;
  email: string;
  /**
   * True when Supabase did not return a session, i.e. the project has "Confirm email" enabled
   * and the account cannot sign in before the address is verified.
   */
  emailConfirmationRequired: boolean;
}
