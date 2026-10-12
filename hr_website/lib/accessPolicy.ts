import { normalizeRole } from "@/lib/domain/roles";
import type { MessageKey, Translate } from "@/lib/i18n/translate";
import { translateVi } from "@/lib/i18n/translate";

/**
 * What a role is allowed to do, and which screen that ability belongs to (SCRUM-59).
 *
 * One table drives all three layers of the app:
 *
 * - `proxy.ts` bounces a deep link the role may not open (`canAccessScreen`),
 * - the sidebar only renders the links the role may open,
 * - a page hides the controls behind `useProfile().can("…")`,
 * - a route handler refuses the call with `403` before it reaches the use case.
 *
 * The database repeats the same rules in RLS (`is_organization_manager()` / `is_organization_owner()`),
 * so a capability added here without a matching policy — or the other way round — is a bug in one of
 * the two places, never a hole: the narrowest of the two wins.
 */
export const CAPABILITIES = [
  /** The dashboard, the notifications screen and the AI assistant: every signed-in member. */
  "dashboard:view",
  "notification:view",
  "knowledge:view",
  /** Own requests / own shifts — every member, narrowed to own rows by RLS. */
  "request:view",
  /**
   * File one's own đơn (SCRUM-41). Every member holds it *except the organization's `OWNER`* (SCRUM-63):
   * they stand above the approval chain, so `/requests` offers them no "Tạo đơn" and
   * `POST /api/requests` answers `403` for them. `requests_insert_own` still keeps every stored row
   * its author's own.
   */
  "request:create",
  "schedule:view",
  /**
   * Clock in / clock out (SCRUM-68). Every member holds it *except the organization's `OWNER`*: they
   * stand above the operation, so `/check-in` offers them no button and both check-in endpoints answer
   * `403`. The use case repeats the rule and `attendance_insert_own` refuses the row in the database.
   */
  "attendance:checkin",
  /**
   * One's own passkeys (SCRUM-79): `/security` is where a member turns Face ID quick login on for the
   * device they are using. It grants no row and no branch — the credential lives in Supabase Auth, which
   * scopes every passkey call to the signed-in caller — so every role holds it (see
   * `EMPLOYEE_CAPABILITIES`, which carries the row the other two inherit).
   */
  "security:manage",

  /** Manager: run the operation. */
  "revenue:manage",
  "report:view",
  "employee-status:view",
  /**
   * The Bảng công review screen (SCRUM-21). Manager-only since SCRUM-68: an employee's own timesheet is
   * `/check-in`, which reads `/api/attendance` under the same RLS, so the review screen — geofence
   * verdict, sửa giờ, xử lý khiếu nại, xác nhận — is not theirs to open. Hidden rather than read-only
   * because every action on it needs `attendance:review` anyway.
   */
  "attendance:view",
  "request:review",
  "schedule:manage",
  "attendance:review",
  "facility:manage",
  "branch:view",
  /** Edit the branch you are the chi nhánh trưởng of (SCRUM-61); the use case narrows it to that one. */
  "branch:update",
  /** The staff directory (SCRUM-24) as a data source for the schedule/branch pickers. */
  "directory:view",
  /** Owner only. */
  "branch:manage",
  "staff:manage",
  "organization:manage",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const EMPLOYEE_CAPABILITIES: readonly Capability[] = [
  "dashboard:view",
  "notification:view",
  "knowledge:view",
  "request:view",
  "request:create",
  "schedule:view",
  // Every role holds `security:manage` too (SCRUM-79): a passkey belongs to the account, not to a job, so
  // an owner and a manager turn Face ID on for themselves exactly like an employee does.
  "security:manage",

  // An employee does **not** hold `attendance:view` (SCRUM-68): the review screen is the manager's, and
  // their own timesheet lives on `/check-in` (30-day history, same `/api/attendance` under RLS).
  // Everybody below the owner clocks in though; see `OWNER_CAPABILITIES` for the exception.
  "attendance:checkin",
];

const MANAGER_CAPABILITIES: readonly Capability[] = [
  ...EMPLOYEE_CAPABILITIES,
  "revenue:manage",
  "report:view",
  "employee-status:view",
  "request:review",
  "schedule:manage",
  // Bảng công review (SCRUM-21) — the employee half of this capability was removed by SCRUM-68.
  "attendance:view",
  "attendance:review",
  "facility:manage",
  "branch:view",
  "branch:update",
  "directory:view",
];

/**
 * The owner may do everything a manager may, plus own the organization: its branches, its staff
 * accounts and its settings. Written as an extension so a capability added to `MANAGER` can never
 * be forgotten for `OWNER` — with two deliberate exceptions, both describing the same idea (the owner
 * sits above the day-to-day operation): they do not *file* đơn (SCRUM-63), and they do not *clock in*
 * (SCRUM-68). `ReviewRequestUseCase` still allows an owner to decide their own legacy request; the
 * screens and the APIs simply no longer offer those two actions.
 */
const OWNER_CAPABILITIES: readonly Capability[] = [
  ...MANAGER_CAPABILITIES.filter(
    (capability) =>
      capability !== "request:create" && capability !== "attendance:checkin",
  ),
  "branch:manage",
  "staff:manage",
  "organization:manage",
];

const ROLE_CAPABILITIES: Readonly<Record<string, ReadonlySet<string>>> = {
  EMPLOYEE: new Set<string>(EMPLOYEE_CAPABILITIES),
  MANAGER: new Set<string>(MANAGER_CAPABILITIES),
  OWNER: new Set<string>(OWNER_CAPABILITIES),
};

/**
 * A `security definer` RPC cannot be reached with a role the app does not know, and an account whose
 * profile row is missing answers `false` rather than throwing while a page renders.
 */
export function can(role: string | null | undefined, capability: Capability): boolean {
  return ROLE_CAPABILITIES[normalizeRole(role)]?.has(capability) ?? false;
}

/**
 * Every screen of the shell with the capability it needs, in the order the sidebar shows them.
 * `/organization` is in the table because it is gated like the others even though it is reached
 * from the organization card rather than from a navigation link (SCRUM-51).
 */
export const SCREEN_ACCESS: readonly { path: string; capability: Capability }[] = [
  { path: "/", capability: "dashboard:view" },
  { path: "/branches", capability: "branch:view" },
  { path: "/facilities", capability: "facility:manage" },
  { path: "/revenue", capability: "revenue:manage" },
  { path: "/requests", capability: "request:view" },
  { path: "/schedules", capability: "schedule:view" },
  { path: "/employee-status", capability: "employee-status:view" },
  // SCRUM-68 sits next to the timesheet it feeds: `/check-in` is where a ca is started and closed,
  // `/attendance` is where a manager reviews the rows that come out of it.
  { path: "/check-in", capability: "attendance:checkin" },
  { path: "/attendance", capability: "attendance:view" },
  { path: "/staff", capability: "staff:manage" },
  { path: "/reports", capability: "report:view" },
  { path: "/notifications", capability: "notification:view" },
  { path: "/chat", capability: "knowledge:view" },
  { path: "/organization", capability: "organization:manage" },
  // SCRUM-79 sits at the end on purpose: it is an account setting rather than a daily destination, and
  // the order here is only what `firstAccessiblePath` walks — the sidebar has its own list.
  { path: "/security", capability: "security:manage" },

];

/**
 * Paths outside the table (login, register, onboarding, change-password) are not the shell's
 * business: `proxy.ts` already decides who may see those, so an unknown path is allowed here.
 */
export function canAccessScreen(
  role: string | null | undefined,
  pathname: string,
): boolean {
  const screen = SCREEN_ACCESS.find((entry) => entry.path === pathname);

  return screen ? can(role, screen.capability) : true;
}

/**
 * Where an account that may not open the current screen should land instead. Falls back to the
 * dashboard, which every role may open.
 */
export function firstAccessiblePath(role: string | null | undefined): string {
  const screen = SCREEN_ACCESS.find((entry) => can(role, entry.capability));

  return screen?.path ?? "/";
}

/**
 * The dictionary keys of `users.role`; the single copy the header, the pages and the search render. The
 * copy itself lives in `lib/i18n/messages/*`, because three screens plus quick search show the same three
 * labels and a second hand-written table is what drifts.
 */
export const ROLE_KEYS: Readonly<Record<string, MessageKey>> = {
  OWNER: "role.owner",
  MANAGER: "role.manager",
  EMPLOYEE: "role.employee",
};

/**
 * The label of a role.
 *
 * `t` is optional and **last**, the shape every shared label helper uses: a component passes
 * `useLocale().t`, while a caller without a provider — or a screen that has not been migrated yet —
 * receives the Vietnamese wording from the dictionary's source locale, exactly what this function
 * returned before the label moved into `lib/i18n/messages/*`.
 */
export function roleLabel(
  role: string | null | undefined,
  t: Translate = translateVi,
): string {
  const normalized = normalizeRole(role);
  const key = ROLE_KEYS[normalized];

  return key ? t(key) : normalized || "—";
}
