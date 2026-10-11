/**
 * One passkey — a WebAuthn credential — registered for an account (SCRUM-79): the device-side key that
 * Face ID, Windows Hello or a fingerprint unlocks, and what `signInWithPasskey()` consumes on `/login`.
 *
 * Nothing biometric is stored anywhere: the private key never leaves the device and Supabase Auth keeps
 * only its public half, so this entity is metadata alone. `/security` lists these rows and is the only
 * place that registers, renames or deletes one.
 */
export interface Passkey {
  id: string;
  /**
   * The label the operating system shows in its picker, `null` when it was never set: GoTrue does not
   * require one and the registration call takes no name (`RegisterPasskeyCredentials` has no field for
   * it), so `/security` renames the credential in a second call right after the ceremony.
   */
  friendly_name: string | null;
  created_at: string;
  /** Set by Supabase Auth each time this credential signs somebody in; `null` while it never has. */
  last_used_at: string | null;
}
