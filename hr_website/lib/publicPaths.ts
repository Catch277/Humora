/**
 * Screens that render outside the authenticated shell. `proxy.ts` lets them through without a
 * session and the shell components (`Header`, `Sidebar`) skip rendering on them — kept in one
 * list so adding a public screen cannot leave the shell half-hidden.
 */
export const PUBLIC_PATHS: readonly string[] = ["/login", "/register"];

/**
 * Screens that need a session but still render without the shell (SCRUM-51/52): `/onboarding`
 * while the account belongs to no organization yet, and `/change-password` while an owner-created
 * account still uses the temporary password. The navigation is hidden there because every link
 * would bounce straight back, while the header stays so the account can still sign out.
 *
 * `/reset-password` joined them because its session is a *recovery* one: the account is signed in for
 * exactly as long as it takes to set the new password, and a shell full of links would be beside the
 * point. It cannot be a `PUBLIC_PATHS` entry — by the time the page renders, `GET /api/auth/recovery`
 * has already established the session, and `proxy.ts` sends a signed-in visitor away from a public
 * path.
 */
export const SHELL_LESS_PATHS: readonly string[] = [
  "/onboarding",
  "/change-password",
  "/reset-password",
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname);
}

export function isShellLessPath(pathname: string): boolean {
  return isPublicPath(pathname) || SHELL_LESS_PATHS.includes(pathname);
}
