"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import OrganizationCard from "@/components/OrganizationCard";
import BrandMark from "@/components/BrandMark";
import { visibleNavigation } from "@/components/navigation";
import { useLocale } from "@/components/LocaleProvider";
import { useProfile } from "@/components/ProfileProvider";
import { isShellLessPath } from "@/lib/publicPaths";
import {
  SIDEBAR_COOKIE,
  SIDEBAR_COOKIE_MAX_AGE_SECONDS,
  type SidebarState,
} from "@/lib/sidebarPreference";

type SidebarProps = {
  /** Resolved from the `humora-sidebar` cookie by `app/layout.tsx`. */
  initialCollapsed?: boolean;
};

/**
 * The desktop navigation.
 *
 * It is `hidden … md:flex`, so a phone never sees it — `MobileNav` renders the same list as a drawer below
 * that breakpoint. Both read `@/components/navigation`, which is what keeps the two from drifting, and the
 * capability filter inside `visibleNavigation` is the same table `proxy.ts` uses.
 *
 * The rail also collapses to an icon-only `w-16` strip, so a wide screen gets the space back. The choice
 * is a cookie read by `app/layout.tsx` before the first paint instead of `localStorage` (a width the server
 * cannot see would snap from 224px to 64px after hydration — see `lib/sidebarPreference`), and only this
 * rail has a collapsed state: the phone drawer is always a drawer.
 *
 * The links are grouped under headings (`NAV_GROUPS`), because fifteen flat entries stop being scannable at
 * about the length this app reached.
 */
export default function Sidebar({ initialCollapsed = false }: SidebarProps) {
  const pathname = usePathname();
  const { can } = useProfile();
  const { t } = useLocale();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  // Onboarding screens hide the navigation (every link would bounce back) but keep the header.
  if (isShellLessPath(pathname)) {
    return null;
  }

  const navGroups = visibleNavigation(can);
  const toggleLabel = collapsed ? t("nav.expand") : t("nav.collapse");

  /**
   * Only the click changes the preference: the cookie is written here rather than in an effect that reads
   * storage afterwards, which keeps `react-hooks/set-state-in-effect` satisfied and the state honest.
   */
  function toggleCollapsed() {
    const next = !collapsed;
    const value: SidebarState = next ? "collapsed" : "expanded";
    setCollapsed(next);

    try {
      document.cookie = `${SIDEBAR_COOKIE}=${value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
    } catch {
      /* Cookie bị chặn: lựa chọn vẫn có hiệu lực cho phiên này. */
    }
  }

  return (
    <aside
      className={`relative z-20 hidden h-dvh shrink-0 flex-col border-r border-slate-200/80 bg-surface shadow-sm transition-[width] duration-200 ease-out motion-reduce:transition-none md:flex ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      <div
        className={`flex h-16 items-center border-b border-slate-100 ${
          collapsed ? "justify-center px-2" : "gap-3 px-5"
        }`}
      >
        <BrandMark />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-bold text-slate-900">Humora</p>
            <p className="mt-0.5 text-[10px] font-medium text-slate-500">
              HR &amp; Shift Intelligence
            </p>
          </div>
        )}
      </div>

      <nav
        id="app-navigation"
        aria-label={t("header.navigation")}
        className={`scrollbar-none flex flex-1 flex-col gap-5 overflow-y-auto py-6 ${
          collapsed ? "px-2" : "px-3"
        }`}
      >
        {navGroups.map((group, groupIndex) => (
          <div key={group.labelKey} className="flex flex-col gap-1">
            {/*
              Copy cannot shrink to a rail, so a collapsed group keeps its heading for a screen reader only
              (`sr-only`, never dropped) and swaps the visible label for the rule between the blocks.
            */}
            {collapsed && groupIndex > 0 && (
              <div aria-hidden="true" className="mx-1 mb-1 h-px bg-slate-100" />
            )}
            <p
              className={
                collapsed
                  ? "sr-only"
                  : "mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400"
              }
            >
              {t(group.labelKey)}
            </p>
            {group.items.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              const label = t(item.labelKey);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  // The rail has no room for the text, so the name moves into the native tooltip.
                  title={collapsed ? label : undefined}
                  className={`group flex items-center rounded-lg py-2.5 text-[13px] transition-colors ${
                    collapsed ? "justify-center px-0" : "gap-3 px-3"
                  } ${
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
                  {/*
                    Kept in the DOM as `sr-only` instead of dropped: the `title` only helps a mouse, and a rail
                    of unlabelled links would leave a screen reader nothing to announce.
                  */}
                  <span className={collapsed ? "sr-only" : "min-w-0 truncate"}>{label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/*
        The toggle rides the rail's right border instead of sitting in the list: at the foot it read as one
        more destination, and its text was wider than the 64px rail could hold. One icon-only circle centred
        on the border keeps the same position in both widths and leaves the whole panel to navigation.
      */}
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        aria-controls="app-navigation"
        aria-label={toggleLabel}
        title={toggleLabel}
        className="absolute right-0 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-slate-200 bg-surface text-slate-400 shadow-sm transition-colors hover:border-primary hover:bg-blue-50 hover:text-primary"
      >
        {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
      </button>

      {/* The organization card (SCRUM-51/59) — shared with the phone drawer. */}
      <OrganizationCard compact={collapsed} />
    </aside>
  );
}
