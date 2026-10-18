"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import OrganizationCard from "@/components/OrganizationCard";
import BrandMark from "@/components/BrandMark";
import { visibleNavigation } from "@/components/navigation";
import { useLocale } from "@/components/LocaleProvider";
import { useProfile } from "@/components/ProfileProvider";
import { isShellLessPath } from "@/lib/publicPaths";

/**
 * The desktop navigation.
 *
 * It is `hidden … md:flex`, so a phone never sees it — `MobileNav` renders the same list as a drawer below
 * that breakpoint. Both read `@/components/navigation`, which is what keeps the two from drifting, and the
 * capability filter inside `visibleNavigation` is the same table `proxy.ts` uses.
 */
export default function Sidebar() {
  const pathname = usePathname();
  const { can } = useProfile();
  const { t } = useLocale();

  // Onboarding screens hide the navigation (every link would bounce back) but keep the header.
  if (isShellLessPath(pathname)) {
    return null;
  }

  const navItems = visibleNavigation(can);

  return (
    <aside className="z-20 hidden h-dvh w-56 shrink-0 flex-col border-r border-slate-200/80 bg-surface shadow-sm md:flex">
      <div className="flex h-16 items-center gap-3 border-b border-slate-100 px-5">
        <BrandMark />
        <div className="leading-tight">
          <p className="text-sm font-bold text-slate-900">Humora</p>
          <p className="mt-0.5 text-[10px] font-medium text-slate-500">
            HR & Shift Intelligence
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-6">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {t("nav.sectionLabel")}
        </p>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
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
              {t(item.labelKey)}
            </Link>
          );
        })}
      </div>

      {/* The organization card (SCRUM-51/59) — shared with the phone drawer. */}
      <OrganizationCard />
    </aside>
  );
}
