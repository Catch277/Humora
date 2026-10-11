"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import OrganizationCard from "@/components/OrganizationCard";
import { visibleNavigation } from "@/components/navigation";
import { useProfile } from "@/components/ProfileProvider";
import { isShellLessPath } from "@/lib/publicPaths";

/**
 * The phone navigation: a hamburger that opens the same list the desktop sidebar shows.
 *
 * The sidebar is `hidden … md:flex`, so below 768px it is not merely collapsed — it is absent, and before
 * this component existed a phone had no way to change screens at all. The list comes from
 * `@/components/navigation`, which both navigations read, so a screen added to one is added to the other.
 *
 * The drawer renders only while it is open (which keeps its organization request off every phone page
 * load), it is a `role="dialog"` that Escape and the backdrop close, the page behind cannot scroll, and
 * focus moves into the panel and back to the hamburger — the four things a phone user expects from a
 * navigation overlay.
 */
export default function MobileNav() {
  const pathname = usePathname();
  const { can } = useProfile();
  /**
   * The pathname the drawer was opened at, rather than a boolean: navigating makes `isOpen` false by
   * itself, so every way of leaving the screen (a link here, the header search, a notification) closes it
   * without an effect that sets state — which React 19's `react-hooks/set-state-in-effect` rejects.
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const isOpen = openedAt === pathname;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Escape closes the panel, and the page behind it must not scroll while it is up.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenedAt(null);
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Focus follows the panel; `wasOpen` keeps the first mount from stealing focus from the page.
  useEffect(() => {
    if (isOpen) {
      wasOpen.current = true;
      closeRef.current?.focus();
      return;
    }

    if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.focus();
    }
  }, [isOpen]);

  // Rotating to landscape (or opening the page on a tablet) hands the navigation back to the sidebar,
  // which CSS hides this drawer for — so it has to close there too, or the scroll lock would outlive it.
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");

    function handleBreakpointChange(event: MediaQueryListEvent) {
      if (event.matches) {
        setOpenedAt(null);
      }
    }

    desktop.addEventListener("change", handleBreakpointChange);

    return () => desktop.removeEventListener("change", handleBreakpointChange);
  }, []);

  // Onboarding screens hide the navigation (every link would bounce back) but keep the header, so the
  // hamburger has nothing to offer there — exactly like `Sidebar`.
  if (isShellLessPath(pathname)) {
    return null;
  }

  const navItems = visibleNavigation(can);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpenedAt(pathname)}
        aria-label="Mở điều hướng"
        aria-expanded={isOpen}
        aria-controls="mobile-navigation"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-surface text-slate-600 transition-colors hover:bg-slate-50 md:hidden"
      >
        <Menu size={17} />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Đóng điều hướng"
            onClick={() => setOpenedAt(null)}
            className="absolute inset-0 h-full w-full cursor-default bg-slate-900/40"
          />

          <div
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Điều hướng"
            className="absolute inset-y-0 left-0 flex h-dvh w-72 max-w-[85%] flex-col border-r border-slate-200/80 bg-surface shadow-xl"
          >
            <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-100 px-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white shadow-sm shadow-blue-200">
                H
              </div>
              <div className="leading-tight">
                <p className="text-sm font-bold text-slate-900">Humora</p>
                <p className="mt-0.5 text-[10px] font-medium text-slate-500">
                  HR &amp; Shift Intelligence
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpenedAt(null)}
                aria-label="Đóng điều hướng"
                className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              >
                <X size={17} />
              </button>
            </div>

            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-3 py-4">
              <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Hệ thống quản lý
              </p>
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpenedAt(null)}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors ${
                      isActive
                        ? "bg-blue-50 font-semibold text-primary"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <Icon
                      size={18}
                      className={isActive ? "text-primary" : "text-slate-400"}
                    />
                    {item.name}
                  </Link>
                );
              })}
            </nav>

            <div className="shrink-0">
              <OrganizationCard />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
