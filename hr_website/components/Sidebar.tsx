"use client";

import {
  Bell,
  Bot,
  Building2,
  ChevronRight,
  CircleDollarSign,
  FileText,
  CalendarRange,
  Fingerprint,
  ScanFace,
  Landmark,
  PackageSearch,
  UserCheck,
  UsersRound,
  ClipboardCheck,
  LayoutDashboard,
  PieChart,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { SCREEN_ACCESS } from "@/lib/accessPolicy";
import { isPublicPath, isShellLessPath } from "@/lib/publicPaths";

const navItems = [
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

type OrganizationSummary = {
  organization: { id: string; name: string } | null;
  member_count: number;
};

/** Shared by the organization link (owners) and the plain card (everybody else). */
const ORGANIZATION_CARD_CLASS =
  "m-3 block rounded-xl border border-blue-100 bg-surface-accent p-3 transition-colors hover:border-blue-200 hover:bg-surface-accent-strong";

export default function Sidebar() {
  const pathname = usePathname();
  const { can } = useProfile();
  const [organization, setOrganization] = useState<OrganizationSummary | null>(null);

  // The organization card in the footer; anything unexpected (no session, script not applied yet)
  // simply leaves it empty instead of breaking the navigation.
  useEffect(() => {
    if (isPublicPath(pathname)) {
      return;
    }

    let cancelled = false;

    fetch("/api/organizations/current", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: OrganizationSummary | null) => {
        if (!cancelled) {
          setOrganization(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOrganization(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Onboarding screens hide the navigation (every link would bounce back) but keep the header.
  if (isShellLessPath(pathname)) {
    return null;
  }

  /**
   * A link is rendered only when the role may open its screen (SCRUM-59). The capability comes from
   * the shared table in `lib/accessPolicy.ts` rather than from a second list here, so the navigation
   * and the `canAccessScreen` gate in `proxy.ts` cannot drift apart. A path the table does not know
   * stays visible — exactly like `proxy.ts`, which only bounces the paths it lists.
   */
  const visibleNavItems = navItems.filter((item) => {
    const capability = SCREEN_ACCESS.find(
      (screen) => screen.path === item.href,
    )?.capability;

    return capability ? can(capability) : true;
  });

  const organizationCard = (
    <>
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
        <Landmark size={14} className="text-primary" />
        <span className="truncate">
          {organization?.organization?.name ?? "Chưa có tổ chức"}
        </span>
        <ChevronRight size={14} className="ml-auto shrink-0 text-slate-400" />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
        {organization?.organization ? (
          <>
            <UsersRound size={12} />
            {organization.member_count} thành viên
          </>
        ) : (
          <>
            <Landmark size={12} />
            Nhấn để tạo hoặc tham gia tổ chức
          </>
        )}
      </p>
      <p className="mt-1 text-[10px] text-slate-500">
        Bản phát hành{" "}
        <span className="float-right font-medium text-slate-700">v2.5</span>
      </p>
    </>
  );

  return (
    <aside className="z-20 hidden h-dvh w-56 shrink-0 flex-col border-r border-slate-200/80 bg-surface shadow-sm md:flex">
      <div className="flex h-16 items-center gap-3 border-b border-slate-100 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white shadow-sm shadow-blue-200">
          H
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold text-slate-900">Humora</p>
          <p className="mt-0.5 text-[10px] font-medium text-slate-500">
            HR & Shift Intelligence
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-6">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Hệ thống quản lý
        </p>
        {visibleNavItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors ${
                isActive
                  ? "bg-blue-50 font-semibold text-primary"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Icon
                size={17}
                className={
                  isActive
                    ? "text-primary"
                    : "text-slate-400 transition-colors group-hover:text-slate-600"
                }
              />
              {item.name}
            </Link>
          );
        })}
      </div>

      {/*
        The organization screen is deliberately not a navigation tab (SCRUM-51): setup happens once,
        right after login, and lives in `/onboarding`. This card is how the owner gets back to it,
        and the redirect in `proxy.ts` sends an account without an organization to `/onboarding`
        instead — so the same link serves both cases.

        SCRUM-59 makes `/organization` an owner-only screen, so a manager or an employee sees the
        same card without the link: the organization's name and member count are useful context,
        while the settings behind the link are not theirs to change (and would bounce straight back).
      */}
      {can("organization:manage") ? (
        <Link href="/organization" className={ORGANIZATION_CARD_CLASS}>
          {organizationCard}
        </Link>
      ) : (
        <div className={ORGANIZATION_CARD_CLASS}>{organizationCard}</div>
      )}
    </aside>
  );
}

