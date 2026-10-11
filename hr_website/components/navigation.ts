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

export type NavigationItem = {
  name: string;
  href: string;
  icon: LucideIcon;
};

/**
 * The shell's navigation, in the order both navigations render it.
 *
 * It lives outside the two components on purpose: the desktop sidebar and the phone drawer must offer the
 * same list — a link that exists on a laptop but not on a phone is exactly the bug the drawer was added to
 * fix — and two copies drift the moment a screen is added.
 */
export const NAV_ITEMS: readonly NavigationItem[] = [
  { name: "Tổng quan", href: "/", icon: LayoutDashboard },
  { name: "Quản lý chi nhánh", href: "/branches", icon: Building2 },
  { name: "Cơ sở vật chất", href: "/facilities", icon: PackageSearch },
  { name: "Doanh thu", href: "/revenue", icon: CircleDollarSign },
  { name: "Đơn từ", href: "/requests", icon: FileText },
  { name: "Lịch làm việc", href: "/schedules", icon: CalendarRange },
  { name: "Trạng thái nhân viên", href: "/employee-status", icon: UserCheck },
  { name: "Chấm công", href: "/check-in", icon: Fingerprint },
  { name: "Bảng công", href: "/attendance", icon: ClipboardCheck },
  { name: "Quản lý nhân sự", href: "/staff", icon: UsersRound },
  { name: "Báo cáo", href: "/reports", icon: PieChart },
  { name: "Thông báo", href: "/notifications", icon: Bell },
  { name: "Trợ lý AI", href: "/chat", icon: Bot },
  { name: "Bảo mật", href: "/security", icon: ScanFace },
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
