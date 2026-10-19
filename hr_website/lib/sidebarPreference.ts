/**
 * The desktop navigation's width preference: the full rail or the icon-only one.
 *
 * A cookie rather than `localStorage`, for the same reason `humora-locale` is one: `app/layout.tsx` reads
 * it on the server, so a collapsed sidebar is already narrow in the first painted frame. A `localStorage`
 * value is invisible to the server render, which would snap the shell sideways after hydration.
 *
 * The name lives here because two files share it — the layout reads, `components/Sidebar.tsx` writes — and
 * a constant cannot be exported from a `"use client"` module to a server component.
 */
export const SIDEBAR_COOKIE = "humora-sidebar";

/** One year: a layout preference, like the language and theme choices. */
export const SIDEBAR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type SidebarState = "expanded" | "collapsed";

/**
 * Absent or unreadable means the default the app has always shipped: the full 224px rail. Anything other
 * than an explicit `collapsed` keeps every existing browser expanded.
 */
export function isSidebarCollapsed(value: unknown): boolean {
  return value === "collapsed";
}
