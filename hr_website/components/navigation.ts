import {
  Bell,
  Banknote,
  Bot,
  Briefcase,
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
  Wrench,
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

/** A heading and the links it owns: `Sidebar` and `MobileNav` render one block per group. */
export type NavigationGroup = {
  /** The dictionary key of the heading, so the grouping is language-independent like the labels. */
  labelKey: MessageKey;
  items: readonly NavigationItem[];
};

/**
 * The shell's navigation, grouped under the headings both navigations render.
 *
 * It lives outside the two components on purpose: the desktop sidebar and the phone drawer must offer the
 * same list — a link that exists on a laptop but not on a phone is exactly the bug the drawer was added to
 * fix — and two copies drift the moment a screen is added. Only the *label key* is stored, so the list is
 * language-independent and `Sidebar`/`MobileNav` render it through `t()`.
 *
 * The groups follow what a reader is doing rather than the order the screens were built in: the daily loop
 * (ca & chấm công, vận hành) sits above the things configured once (nhân sự & lương), and everything that
 * is about the account itself is filed under Hệ thống. Keep the headings few — a label per link would be
 * the same list with more ink.
 */
export const NAV_GROUPS: readonly NavigationGroup[] = [
  {
    labelKey: "nav.groupWorkspace",
    items: [
      { labelKey: "nav.dashboard", href: "/", icon: LayoutDashboard },
      { labelKey: "nav.reports", href: "/reports", icon: PieChart },
    ],
  },
  {
    labelKey: "nav.groupShifts",
    items: [
      { labelKey: "nav.schedules", href: "/schedules", icon: CalendarRange },
      { labelKey: "nav.checkIn", href: "/check-in", icon: Fingerprint },
      { labelKey: "nav.attendance", href: "/attendance", icon: ClipboardCheck },
      {
        labelKey: "nav.employeeStatus",
        href: "/employee-status",
        icon: UserCheck,
      },
    ],
  },
  {
    labelKey: "nav.groupOperations",
    items: [
      { labelKey: "nav.revenue", href: "/revenue", icon: CircleDollarSign },
      { labelKey: "nav.requests", href: "/requests", icon: FileText },
      { labelKey: "nav.facilities", href: "/facilities", icon: PackageSearch },
      { labelKey: "nav.branches", href: "/branches", icon: Building2 },
    ],
  },
  {
    labelKey: "nav.groupCustomers",
    items: [
      { labelKey: "nav.customers", href: "/customers", icon: Briefcase },
      { labelKey: "nav.maintenance", href: "/maintenance", icon: Wrench },
    ],
  },
  {
    labelKey: "nav.groupPeople",
    items: [
      { labelKey: "nav.staff", href: "/staff", icon: UsersRound },
      { labelKey: "nav.payroll", href: "/payroll", icon: Banknote },
    ],
  },
  {
    labelKey: "nav.groupSystem",
    items: [
      { labelKey: "nav.notifications", href: "/notifications", icon: Bell },
      { labelKey: "nav.chat", href: "/chat", icon: Bot },
      { labelKey: "nav.security", href: "/security", icon: ScanFace },
    ],
  },
];

/**
 * A link is rendered only when the role may open its screen (SCRUM-59). The capability comes from the
 * shared table in `lib/accessPolicy.ts` rather than from a second list here, so the navigation and the
 * `canAccessScreen` gate in `proxy.ts` cannot drift apart. A path the table does not know stays visible —
 * exactly like `proxy.ts`, which only bounces the paths it lists.
 *
 * A group that loses every link is dropped with it: a heading over an empty block reads as a broken panel,
 * and a role reads only the groups — and the entries — it may actually open.
 */
export function visibleNavigation(
  can: (capability: Capability) => boolean,
): NavigationGroup[] {
  return NAV_GROUPS.map((group) => ({
    labelKey: group.labelKey,
    items: group.items.filter((item) => {
      const capability = SCREEN_ACCESS.find(
        (screen) => screen.path === item.href,
      )?.capability;

      return capability ? can(capability) : true;
    }),
  })).filter((group) => group.items.length > 0);
}
