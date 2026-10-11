"use client";

import {
  Bell,
  CalendarRange,
  FileText,
  Loader2,
  LogOut,
  Search,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import MobileNav from "@/components/MobileNav";
import ThemeToggle from "@/components/ThemeToggle";
import { useProfile } from "@/components/ProfileProvider";
import { roleLabel } from "@/lib/accessPolicy";
import type { QuickSearchResult } from "@/lib/domain/entities/QuickSearch";
import { isBranchHeadRole, isOwnerRole } from "@/lib/domain/roles";
import { isPublicPath } from "@/lib/publicPaths";

/** `GET /api/search` cần tối thiểu 2 ký tự; dưới ngưỡng đó chỉ hiện gợi ý, không gọi API. */
const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 250;

/**
 * How often the bell badge is refreshed (SCRUM-70). The producers write rows while the shell is
 * mounted — a ca is assigned, a đơn is filed — so a route change alone would leave the badge stale on
 * the screen the user is reading. Cheap: one row, `unread=true&page_size=1` (see the route docs).
 */
const UNREAD_POLL_INTERVAL_MS = 30_000;

/**
 * `null` means "could not read the count" (offline, 401) — the caller keeps the number it already
 * shows instead of flipping the badge to 0 and back.
 */
async function fetchUnreadCount(): Promise<number | null> {
  try {
    const response = await fetch(
      "/api/notifications?page=1&page_size=1&unread=true",
      { cache: "no-store" },
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { total?: number };

    return typeof data.total === "number" ? data.total : 0;
  } catch {
    return null;
  }
}

const REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
};

/** Một dòng kết quả đã chuẩn hoá, dùng chung cho hiển thị và điều hướng bằng bàn phím. */
type SearchHit = {
  id: string;
  group: "users" | "requests" | "shifts";
  title: string;
  subtitle: string;
  href: string;
};

const GROUP_ICONS: Record<SearchHit["group"], typeof UsersRound> = {
  users: UsersRound,
  requests: FileText,
  shifts: CalendarRange,
};

const GROUP_LABELS: Record<SearchHit["group"], string> = {
  users: "Nhân viên",
  requests: "Đơn từ",
  shifts: "Ca làm việc",
};

/** `GET /api/branches` as the header needs it: the name, and who heads it (SCRUM-61/63). */
type BranchOption = { id: string; name: string; manager_id: string | null };

function toHits(results: QuickSearchResult | null): SearchHit[] {
  if (!results) {
    return [];
  }

  return [
    ...results.users.map((user) => ({
      id: `user-${user.id}`,
      group: "users" as const,
      title: user.full_name,
      subtitle: `${roleLabel(user.role)} · Quản lý nhân sự`,
      href: "/staff",
    })),
    ...results.requests.map((request) => ({
      id: `request-${request.id}`,
      group: "requests" as const,
      title: request.request_type,
      subtitle: `${REQUEST_STATUS_LABELS[request.status] ?? request.status} · Đơn từ`,
      href: "/requests",
    })),
    ...results.shifts.map((shift) => ({
      id: `shift-${shift.id}`,
      group: "shifts" as const,
      title: shift.name,
      subtitle:
        shift.start_time && shift.end_time
          ? `${shift.start_time} – ${shift.end_time} · Lịch làm việc`
          : "Lịch làm việc",
      href: "/schedules",
    })),
  ];
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  // The profile is read once for the whole shell (SCRUM-59); the header only labels it.
  const { profile } = useProfile();
  const [unreadCount, setUnreadCount] = useState(0);
  // SCRUM-63: the branch line under the name. It comes from the same `branches` list the pickers use,
  // so the header and the screens cannot disagree about which chi nhánh somebody is in.
  const [branchOptions, setBranchOptions] = useState<BranchOption[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuickSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hits = toHits(results);

  useEffect(() => {
    if (isPublicPath(pathname)) {
      return;
    }

    let cancelled = false;

    // Refetched per route change, which also refreshes the badge right after the user reads
    // notifications on `/notifications`.
    void fetchUnreadCount().then((total) => {
      if (!cancelled && total !== null) {
        setUnreadCount(total);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // ...and polled on an interval, because the notification arrives while this screen is open (the
  // producers run in the database). A hidden tab is skipped.
  useEffect(() => {
    if (isPublicPath(pathname)) {
      return;
    }

    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void fetchUnreadCount().then((total) => {
        if (total !== null) {
          setUnreadCount(total);
        }
      });
    }, UNREAD_POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [pathname]);

  // The branch line under the name (SCRUM-63): only a manager and an employee have one — the owner
  // stands above every branch, so the fetch is skipped for them entirely.
  useEffect(() => {
    if (!profile || isOwnerRole(profile.role)) {
      return;
    }

    let cancelled = false;

    fetch("/api/branches", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: BranchOption[]) => {
        if (!cancelled) {
          setBranchOptions(data);
        }
      })
      .catch(() => {
        // A failed lookup only leaves the sub-line empty; the shell must never break for it.
      });

    return () => {
      cancelled = true;
    };
  }, [profile]);

  const branchLabel = useMemo(() => {
    if (!profile || isOwnerRole(profile.role)) {
      return "";
    }

    // A manager is described by the chi nhánh they head — that *is* their scope — while an employee is
    // described by the branch they belong to (`users.branch_id`, SCRUM-60/63).
    if (isBranchHeadRole(profile.role)) {
      const headed = branchOptions
        .filter((branch) => branch.manager_id === profile.id)
        .map((branch) => branch.name);

      if (headed.length > 0) {
        return headed.join(", ");
      }

      // An empty list means "nothing loaded", so it must not claim the manager heads nothing.
      return branchOptions.length > 0 ? "Chưa phụ trách chi nhánh" : "";
    }

    if (branchOptions.length === 0) {
      return "";
    }

    return (
      branchOptions.find((branch) => branch.id === profile.branch_id)?.name ??
      "Chưa gán chi nhánh"
    );
  }, [branchOptions, profile]);

  // Debounced query → GET /api/search. The in-flight request is aborted when the query changes, so a
  // slow response cannot overwrite the results of a newer one.
  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < MIN_QUERY_LENGTH) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}&type=all`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            const data = (await response.json().catch(() => null)) as {
              error?: string;
            } | null;

            throw new Error(
              response.status === 401
                ? "Phiên đăng nhập đã hết hạn."
                : (data?.error ?? "Không tìm kiếm được."),
            );
          }

          return (await response.json()) as QuickSearchResult;
        })
        .then((data) => {
          setResults(data);
          setSearchError("");
          setActiveIndex(-1);
          setIsSearching(false);
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }

          setResults(null);
          setSearchError(
            error instanceof Error ? error.message : "Không tìm kiếm được.",
          );
          setIsSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      // Aborts a request that is already in flight; harmless when none is.
      controller.abort();
    };
  }, [query]);

  // ⌘K / Ctrl+K focuses the search box.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setShowDropdown(true);
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Clicking anywhere outside closes the dropdown. The previous version used a blur timeout, which
  // also closed it while the user was trying to click a result.
  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    }

    document.addEventListener("mousedown", onMouseDown);

    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // The login and register screens render outside the authenticated shell.
  if (isPublicPath(pathname)) {
    return null;
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setActiveIndex(-1);

    if (value.trim().length >= MIN_QUERY_LENGTH) {
      setIsSearching(true);
      setSearchError("");
      setShowDropdown(true);
    } else {
      setIsSearching(false);
      setResults(null);
      setSearchError("");
      setShowDropdown(value.trim().length > 0);
    }
  }

  function clearSearch() {
    setQuery("");
    setResults(null);
    setSearchError("");
    setActiveIndex(-1);
    setShowDropdown(false);
    inputRef.current?.focus();
  }

  function openHit(hit: SearchHit) {
    setShowDropdown(false);
    setActiveIndex(-1);
    setQuery("");
    router.push(hit.href);
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      clearSearch();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (hits.length === 0) {
        return;
      }

      event.preventDefault();
      setActiveIndex((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;

        return (next + hits.length) % hits.length;
      });
      return;
    }

    if (event.key === "Enter" && showDropdown) {
      const hit = hits[activeIndex >= 0 ? activeIndex : 0];

      if (hit) {
        event.preventDefault();
        openHit(hit);
      }
    }
  }

  async function handleSignOut() {
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
    } finally {
      // `replace` keeps the authenticated page out of the history, and `refresh` drops the cached
      // server render so the shell re-renders without a session.
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-slate-200/80 bg-surface px-4 md:gap-4 md:px-6">
      <MobileNav />

      <div
        ref={searchContainerRef}
        className="relative min-w-0 flex-1 md:mx-auto md:max-w-xl"
      >
        <div className="group relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
            <Search
              size={16}
              className="text-slate-400 transition-colors group-focus-within:text-primary"
            />
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => query.trim().length > 0 && setShowDropdown(true)}
            placeholder="Tìm nhanh nhân viên, đơn từ, mã ca làm..."
            aria-label="Tìm kiếm nhanh"
            aria-expanded={showDropdown}
            aria-controls="quick-search-results"
            role="combobox"
            className="block w-full rounded-full border border-slate-200 bg-app py-2 pl-9 pr-9 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-blue-500/15 md:pr-20"
          />
          {query === "" ? (
            <kbd className="pointer-events-none absolute inset-y-0 right-3 my-auto hidden h-5 items-center rounded border border-slate-200 bg-surface px-1.5 text-[10px] font-medium text-slate-500 md:flex">
              ⌘K
            </kbd>
          ) : (
            <button
              type="button"
              onClick={clearSearch}
              title="Xoá tìm kiếm"
              className="absolute inset-y-0 right-3 my-auto flex h-5 items-center rounded-md px-1.5 text-slate-400 transition-colors hover:text-slate-700"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {showDropdown && (
          <div
            id="quick-search-results"
            role="listbox"
            className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-slate-200/80 bg-surface shadow-lg"
          >
            {query.trim().length < MIN_QUERY_LENGTH ? (
              <p className="px-4 py-3 text-xs text-slate-500">
                Nhập ít nhất {MIN_QUERY_LENGTH} ký tự để tìm nhân viên, đơn từ hoặc ca
                làm việc.
              </p>
            ) : isSearching ? (
              <div className="flex items-center gap-2 px-4 py-3 text-xs text-slate-500">
                <Loader2 size={14} className="animate-spin text-primary" />
                Đang tìm kiếm...
              </div>
            ) : searchError ? (
              <p className="px-4 py-3 text-xs text-rose-600">{searchError}</p>
            ) : hits.length === 0 ? (
              <p className="px-4 py-3 text-xs text-slate-500">
                Không tìm thấy kết quả nào cho “{query.trim()}”.
              </p>
            ) : (
              <>
                <ul className="max-h-80 overflow-y-auto py-1">
                  {(["users", "requests", "shifts"] as const).map((group) => {
                    const groupHits = hits.filter((hit) => hit.group === group);

                    if (groupHits.length === 0) {
                      return null;
                    }

                    const GroupIcon = GROUP_ICONS[group];

                    return (
                      <li key={group}>
                        <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          {GROUP_LABELS[group]} ({groupHits.length})
                        </p>
                        <ul>
                          {groupHits.map((hit) => {
                            const index = hits.indexOf(hit);
                            const isActive = index === activeIndex;

                            return (
                              <li key={hit.id}>
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={isActive}
                                  onMouseEnter={() => setActiveIndex(index)}
                                  onClick={() => openHit(hit)}
                                  className={`flex w-full items-start gap-2.5 px-4 py-2 text-left transition-colors ${
                                    isActive ? "bg-slate-50" : "hover:bg-slate-50"
                                  }`}
                                >
                                  <GroupIcon
                                    size={14}
                                    className="mt-0.5 shrink-0 text-slate-400"
                                  />
                                  <span className="min-w-0">
                                    <span className="block truncate text-xs font-medium text-slate-900">
                                      {hit.title}
                                    </span>
                                    <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                                      {hit.subtitle}
                                    </span>
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
                <p className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400">
                  ↑ ↓ để chọn · Enter để mở · Esc để đóng
                </p>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle />

        <Link
          href="/notifications"
          title={
            unreadCount > 0
              ? `${unreadCount} thông báo chưa đọc`
              : "Thông báo"
          }
          className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        >
          <Bell size={17} />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Link>

        <div className="ml-1 hidden items-center gap-2 border-l border-slate-200 pl-3 md:flex">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-primary">
            <UserRound size={16} />
          </div>
          <div className="leading-tight">
            <p className="text-xs font-semibold text-slate-800">
              {profile?.full_name ?? "Đang tải..."}
            </p>
            {branchLabel && (
              // 13rem keeps a two-branch manager's line inside the header; the full text stays in the title.
              <p
                className="mt-0.5 max-w-[13rem] truncate text-[10px] font-medium text-primary"
                title={branchLabel}
              >
                {branchLabel}
              </p>
            )}
            <p className="mt-0.5 text-[10px] text-slate-500">
              {profile ? roleLabel(profile.role) : "—"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleSignOut()}
          title="Đăng xuất"
          className="rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        >
          <LogOut size={15} />
        </button>
      </div>
    </header>
  );
}
