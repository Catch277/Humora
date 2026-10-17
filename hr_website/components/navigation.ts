import {
  Bell,
  Bot,
  Building2,
  CalendarRange,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  Fingerprint,
  LayoutDashboard,
  PackageSearch,
  PieChart,
  ScanFace,
  UserCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { SCREEN_ACCESS, type Capability } from "@/lib/accessPolicy";
import type { MessageKey } from "@/lib/i18n/translate";

export type NavigationItem = {
  /** The dictionary key of the label: the copy itself lives in `lib/i18n/messages/*`, never here. */
  labelKey: MessageKey;
  href: string;
  icon: LucideIcon;
};

/**
 * The shell's navigation, in the order both navigations render it.
 *
 * It lives outside the two components on purpose: the desktop sidebar and the phone drawer must offer the
 * same list — a link that exists on a laptop but not on a phone is exactly the bug the drawer was added to
 * fix — and two copies drift the moment a screen is added. Only the *label key* is stored, so the list is
 * language-independent and `Sidebar`/`MobileNav` render it through `t()`.
 */
export const NAV_ITEMS: readonly NavigationItem[] = [
  { labelKey: "nav.dashboard", href: "/", icon: LayoutDashboard },
  { labelKey: "nav.branches", href: "/branches", icon: Building2 },
  { labelKey: "nav.facilities", href: "/facilities", icon: PackageSearch },
  { labelKey: "nav.revenue", href: "/revenue", icon: CircleDollarSign },
  { labelKey: "nav.requests", href: "/requests", icon: FileText },
  { labelKey: "nav.schedules", href: "/schedules", icon: CalendarRange },
  { labelKey: "nav.employeeStatus", href: "/employee-status", icon: UserCheck },
  { labelKey: "nav.checkIn", href: "/check-in", icon: Fingerprint },
  { labelKey: "nav.attendance", href: "/attendance", icon: ClipboardCheck },
  { labelKey: "nav.staff", href: "/staff", icon: UsersRound },
  { labelKey: "nav.reports", href: "/reports", icon: PieChart },
  { labelKey: "nav.notifications", href: "/notifications", icon: Bell },
  { labelKey: "nav.chat", href: "/chat", icon: Bot },
  { labelKey: "nav.security", href: "/security", icon: ScanFace },
];

/**
 * A link is rendered only when the role may open its screen (SCRUM-59). The capability comes from the
 * shared table in `lib/accessPolicy.ts` rather than from a second list here, so the navigation and the
 * `canAccessScreen` gate in `proxy.ts` cannot drift apart. A path the table does not know stays visible —
 * exactly like `proxy.ts`, which only bounces the paths it lists.
 */
export function visibleNavigation(
  can: (capability: Capability) => boolean,
): NavigationItem[] {
  return NAV_ITEMS.filter((item) => {
    const capability = SCREEN_ACCESS.find(
      (screen) => screen.path === item.href,
    )?.capability;

    return capability ? can(capability) : true;
  });
}
