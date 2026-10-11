/**
 * The role vocabulary of the tenant model (SCRUM-59).
 *
 * Three levels, narrowest last:
 *
 * - `OWNER`   — owns the organization: its settings, its join code, its accounts and its branches.
 * - `MANAGER` — runs the day-to-day operation: shifts, timesheet review, requests, revenue.
 * - `EMPLOYEE`— sees and does only their own things (own shifts, own timesheet, own requests).
 *
 * `CHU` is the pre-SCRUM-59 spelling of `MANAGER`. `normalizeRole` still reads it so the app works
 * whether or not `SCRUM-59_role_model.sql` has been applied to the database yet, which keeps the
 * rename a single-step change instead of a coordinated deploy.
 *
 * This file is framework-free on purpose: the route handlers, the use cases, `proxy.ts` and the
 * client shell all read the same three strings from here, so a policy can never be written against
 * a role name the rest of the app does not know.
 */
export const APP_ROLES = ["OWNER", "MANAGER", "EMPLOYEE"] as const;

export type AppRole = (typeof APP_ROLES)[number];

/** Roles that may manage the organization's operation; also what `is_organization_manager()` means. */
export const MANAGER_ROLES: ReadonlySet<string> = new Set(["OWNER", "MANAGER"]);

/**
 * `CHU` → `MANAGER` is the SCRUM-59 rename; the databases/sessions created before that script still
 * carry the old value, and refusing them would lock every existing manager out of the admin app.
 */
const LEGACY_ROLE_ALIASES: Record<string, string> = { CHU: "MANAGER" };

/**
 * Uppercases and trims a role coming from the database, a JWT or a request body, then applies the
 * legacy aliases. Everything that compares a role must go through this, never through `role === "…"`.
 */
export function normalizeRole(raw: string | null | undefined): string {
  const role = (raw ?? "").trim().toUpperCase();

  return LEGACY_ROLE_ALIASES[role] ?? role;
}

/** True for `OWNER` and `MANAGER`. */
export function isManagerRole(raw: string | null | undefined): boolean {
  return MANAGER_ROLES.has(normalizeRole(raw));
}

/** True for `OWNER` only — the organization's own screens and its staff administration. */
export function isOwnerRole(raw: string | null | undefined): boolean {
  return normalizeRole(raw) === "OWNER";
}

/**
 * Who may head a branch (SCRUM-63): a `MANAGER` and nobody else.
 *
 * The organization's `OWNER` sits *above* every branch — they already pass every branch write policy
 * through `is_organization_owner()`, and the app never attaches them to one (`users.branch_id` too) —
 * so pinning them to a single branch would contradict the model the screens describe. An `EMPLOYEE`
 * has no scope at all. `public.heads_branch()` still accepts an owner, so a legacy `manager_id` keeps
 * working; it grants them nothing they did not already have.
 */
export function isBranchHeadRole(raw: string | null | undefined): boolean {
  return normalizeRole(raw) === "MANAGER";
}

/**
 * True for `EMPLOYEE` only — the role a shift is actually scheduled for (SCRUM-63). A manager and the
 * organization's owner run the operation, so a ca is never assigned to them and the schedule picker
 * leaves them out.
 */
export function isEmployeeRole(raw: string | null | undefined): boolean {
  return normalizeRole(raw) === "EMPLOYEE";
}
