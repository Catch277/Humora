/**
 * Hands a credential to the **browser's own** password manager, so the password field can be filled in on
 * the next visit without this app ever storing a password.
 *
 * Why it exists: `/login` signs in with `fetch`, and a browser only offers "save this password" after a
 * submit it recognises — so a returning reader used to find the address filled in and the password empty.
 * The Credential Management API lets the page tell the manager "this pair is valid" once the server accepted
 * it; from then on the manager autofills the field like it does on any other site.
 *
 * Nothing here outlives the call on our side: `PasswordCredential` lives in the OS/browser keychain (the
 * user can see and delete it in the browser's settings), never in `localStorage`, a cookie or the database —
 * which is what makes it compatible with "do not save passwords in plain text". Chromium implements it;
 * Firefox and Safari leave `window.PasswordCredential` undefined and rely on their own save prompt, so this
 * is a no-op there rather than a failure.
 */
export function offerToBrowserPasswordManager(
  email: string,
  password: string,
): void {
  const PasswordCredential = passwordCredentialConstructor();

  if (!PasswordCredential || typeof navigator === "undefined") {
    return;
  }

  try {
    navigator.credentials
      .store(new PasswordCredential({ id: email, password }))
      .catch(() => {
        /* The manager refused (private window, no user gesture, policy): the browser's own prompt is left. */
      });
  } catch {
    /* Older Chromium: the constructor exists but cannot be used this way. */
  }
}

/**
 * `PasswordCredential` is Chromium-only and TypeScript's DOM lib still omits it, so the constructor is read
 * through one narrow cast instead of `any`.
 */
type PasswordCredentialConstructor = new (data: {
  id: string;
  password: string;
}) => Credential;

function passwordCredentialConstructor(): PasswordCredentialConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }

  const scope = window as unknown as {
    PasswordCredential?: PasswordCredentialConstructor;
  };

  return typeof scope.PasswordCredential === "function"
    ? scope.PasswordCredential
    : null;
}
