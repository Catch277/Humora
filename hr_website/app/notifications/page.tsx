"use client";

import {
  AlertTriangle,
  Bell,
  Building2,
  CalendarRange,
  Check,
  CheckCheck,
  CircleDollarSign,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Loader2,
  PackageSearch,
  RefreshCw,
  Settings2,
  Store,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { asArray, asArrayField } from "@/lib/asArray";
import { canAccessScreen } from "@/lib/accessPolicy";
import type {
  Notification,
  PaginatedNotifications,
} from "@/lib/domain/entities/Notification";
import type { NotificationSetting } from "@/lib/domain/entities/NotificationSetting";
import {
  CATEGORY_LABELS,
  NOTIFICATION_CATEGORIES,
  notificationCategory,
  notificationHref,
  notificationTypeLabel,
  notificationTypesOfCategory,
  type NotificationCategory,
} from "@/lib/domain/notificationCatalog";

const PAGE_SIZE = 20;

/**
 * The producers (SCRUM-70/71/72) write rows while the screen is open — a ca is assigned, a khiếu nại
 * arrives — so the list is re-fetched quietly on this interval. It is not a loading state: a poll
 * must not make the screen look like it is reloading.
 */
const POLL_INTERVAL_MS = 30_000;

const CHANNEL_LABELS: Record<string, string> = {
  in_app: "Trong ứng dụng",
  email: "Email",
  push: "Thông báo đẩy (mobile)",
};

/**
 * What each channel actually does today. Only `in_app` is delivered (the bell and this screen); the
 * other two are switches without a service behind them, and saying so is the point — the drawer used
 * to imply a delivery that never happened.
 */
const CHANNEL_NOTES: Record<string, string> = {
  in_app: "Thông báo hiện trong chuông của ứng dụng. Tắt là ngừng nhận.",
  email: "Chưa được cấu hình: hệ thống chưa có dịch vụ gửi email.",
  push: "Chưa được cấu hình: hệ thống chưa có dịch vụ thông báo đẩy.",
};

/** The icon of a notification group — the same family the sidebar uses for the matching screen. */
const CATEGORY_ICONS: Record<NotificationCategory, typeof Bell> = {
  revenue: CircleDollarSign,
  requests: FileText,
  schedule: CalendarRange,
  attendance: ClipboardCheck,
  staff: UsersRound,
  branch: Building2,
  facility: PackageSearch,
  organization: Store,
};

function formatDateTime(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(parsed);
}

function statusMessage(status: number, serverMessage?: string): string {
  if (status === 401) {
    return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  }

  if (status === 404) {
    return "Thông báo này không còn tồn tại.";
  }

  return serverMessage ?? "Không thực hiện được thao tác. Vui lòng thử lại.";
}

type ChannelToggle = { channel: string; enabled: boolean };

/** The channels the settings drawer always shows, whether or not a row exists yet. */
const KNOWN_CHANNELS = ["in_app", "email", "push"];

function mergeChannels(rows: NotificationSetting[]): ChannelToggle[] {
  return KNOWN_CHANNELS.map((channel) => ({
    channel,
    // `in_app` is the channel the product actually delivers, so a member who has never touched this
    // drawer does receive notifications — the default `notification_in_app_enabled()` applies in the
    // database (SCRUM-70). Showing "off" for a switch the database treats as "on" is what made the old
    // drawer disagree with reality after the first screenshot.
    enabled: rows.find((row) => row.channel === channel)?.enabled ?? channel === "in_app",
  }));
}


export default function NotificationsPage() {
  // The shell already knows the role (SCRUM-59); the inbox uses it to decide where a row links — an
  // employee may not open `/attendance`, so their timesheet rows open `/check-in` (SCRUM-68).
  const { profile } = useProfile();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<"all" | "unread" | "read">("all");
  const [category, setCategory] = useState<NotificationCategory | "all">("all");
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [markingAll, setMarkingAll] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [channels, setChannels] = useState<ChannelToggle[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // The chips expand to the codes the trigger wrote (`type=A,B`), so the inbox is filtered by the
  // database rather than by the page that happens to be loaded.
  const typeFilter =
    category === "all" ? "" : notificationTypesOfCategory(category).join(",");

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<{
      data: Notification[];
      total: number;
      error: string | null;
    }> {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
      });

      if (tab === "unread") {
        params.set("unread", "true");
      } else if (tab === "read") {
        params.set("read", "true");
      }

      if (typeFilter !== "") {
        params.set("type", typeFilter);
      }

      const response = await fetch(`/api/notifications?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        return {
          data: [],
          total: 0,
          error: statusMessage(response.status, data?.error),
        };
      }

      // The page endpoint answers `{ data, total, page, page_size }`; read it defensively so a shape
      // change shows an empty state instead of crashing the feed.
      const payload = (await response.json()) as PaginatedNotifications;

      return {
        data: asArrayField<Notification>(payload, "data"),
        total: typeof payload.total === "number" ? payload.total : 0,
        error: null,
      };
    }

    load()
      .then((result) => {
        if (cancelled) {
          return;
        }

        setNotifications(result.data);
        setTotal(result.total);
        setPageError(result.error ?? "");
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setNotifications([]);
        setTotal(0);
        setPageError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, tab, typeFilter, reloadToken]);

  // A live inbox: the producers (SCRUM-70/71/72) write rows while this screen is open — a ca is
  // assigned, a khiếu nại arrives — so the list is refetched quietly on an interval. It is not a
  // loading state (a poll must not look like a reload), and a hidden tab is skipped.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setReloadToken((token) => token + 1);
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  function refresh() {
    setLoading(true);
    setPageError("");
    setReloadToken((token) => token + 1);
  }

  /** A filter change starts a new server query, so the page has to go back to the first one. */
  function selectTab(next: "all" | "unread" | "read") {
    setTab(next);
    setPage(1);
    setLoading(true);
  }

  function selectCategory(next: NotificationCategory | "all") {
    setCategory(next);
    setPage(1);
    setLoading(true);
  }

  function openSettings() {
    setSettingsOpen(true);
    setSettingsLoading(true);
    setSettingsError("");
    setSettingsSaved(false);
  }

  // The drawer loads its own data on open; the async body keeps setState out of the effect body.
  useEffect(() => {
    if (!settingsOpen) {
      return;
    }

    let cancelled = false;

    async function load(): Promise<{
      settings: NotificationSetting[];
      error: string | null;
    }> {
      const response = await fetch("/api/notifications/settings", {
        cache: "no-store",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        return {
          settings: [],
          error: statusMessage(response.status, data?.error),
        };
      }

      const data = (await response.json()) as NotificationSetting[];

      return { settings: asArray<NotificationSetting>(data), error: null };
    }

    load()
      .then((result) => {
        if (cancelled) {
          return;
        }

        setChannels(mergeChannels(result.settings));
        setSettingsError(result.error ?? "");
        setSettingsLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setSettingsError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
        setSettingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [settingsOpen]);

  async function markRead(notification: Notification) {
    if (notification.is_read || busyId) {
      return;
    }

    setBusyId(notification.id);
    setPageError("");

    try {
      const response = await fetch(
        `/api/notifications/${notification.id}/read`,
        { method: "PATCH" },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setPageError(statusMessage(response.status, data?.error));
        return;
      }

      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, is_read: true } : item,
        ),
      );
    } catch {
      setPageError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setBusyId("");
    }
  }

  async function markAllRead() {
    if (markingAll) {
      return;
    }

    setMarkingAll(true);
    setPageError("");

    try {
      // One statement for the whole inbox (SCRUM-70), narrowed to the active chip so the button acts
      // on what the user is looking at. The screen used to send a `PATCH` per row, so "mark all"
      // could never reach past the page that happened to be loaded.
      const response = await fetch("/api/notifications/read-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          category === "all"
            ? {}
            : { types: notificationTypesOfCategory(category) },
        ),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setPageError(statusMessage(response.status, data?.error));
        return;
      }

      refresh();
    } catch {
      setPageError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setMarkingAll(false);
    }
  }

  async function toggleChannel(notificationChannel: string, enabled: boolean) {
    const next = channels.map((item) =>
      item.channel === notificationChannel ? { ...item, enabled } : item,
    );

    setChannels(next);
    setSettingsError("");
    setSettingsSaved(false);

    try {
      const response = await fetch("/api/notifications/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: next }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setSettingsError(statusMessage(response.status, data?.error));
        return;
      }

      setSettingsSaved(true);
    } catch {
      setSettingsError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    }
  }

  // The tab and the chip are server-side filters, so what came back *is* what the screen shows — no
  // second, page-only filter that would disagree with the counters and the pagination under it.
  const visible = notifications;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200/80 bg-surface p-5 shadow-sm lg:flex-row lg:items-center">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Hệ thống / SCRUM-48 · SCRUM-70
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Thông báo</h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
            Hộp thư của chính tài khoản đang đăng nhập, theo vai trò. Nhân viên nhận ca làm việc, đơn
            từ và bảng công của mình; quản lý chi nhánh nhận việc cần duyệt và các bất thường chấm
            công; chủ sở hữu nhận toàn tổ chức. Bộ lọc chạy trên máy chủ, nên số trang và bộ đếm
            luôn khớp với danh sách.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Tải lại
          </button>
          <button
            type="button"
            onClick={openSettings}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Settings2 size={14} /> Cài đặt kênh nhận
          </button>
          <button
            type="button"
            onClick={() => void markAllRead()}
            disabled={markingAll}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {markingAll ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CheckCheck size={14} />
            )}
            {category === "all"
              ? "Đánh dấu tất cả đã đọc"
              : `Đánh dấu nhóm ${CATEGORY_LABELS[category]} đã đọc`}
          </button>
        </div>
      </section>

      {pageError && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle size={16} />
          {pageError}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-surface shadow-sm">
        <div className="space-y-3 border-b border-slate-100 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { value: "all", label: "Tất cả" },
                { value: "unread", label: "Chưa đọc" },
                { value: "read", label: "Đã đọc" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => selectTab(option.value)}
                aria-pressed={tab === option.value}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  tab === option.value
                    ? "bg-primary text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {option.label}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-slate-500">
              Trang {page}/{lastPage} · {total} thông báo khớp bộ lọc
            </span>
          </div>

          {/* The group chips (SCRUM-70): each one stands for the codes its triggers write, and the
              filter is sent to the API — the note that used to say "chỉ áp dụng trên trang hiện tại"
              is gone because the database now answers the question. */}
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Nhóm thông báo"
          >
            <button
              type="button"
              onClick={() => selectCategory("all")}
              aria-pressed={category === "all"}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                category === "all"
                  ? "border-primary bg-blue-50 text-primary"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              Tất cả nhóm
            </button>
            {NOTIFICATION_CATEGORIES.map((value) => {
              const Icon = CATEGORY_ICONS[value];

              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => selectCategory(value)}
                  aria-pressed={category === value}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    category === value
                      ? "border-primary bg-blue-50 text-primary"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon size={12} />
                  {CATEGORY_LABELS[value]}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            Đang tải thông báo...
          </div>
        ) : visible.length === 0 ? (
          <p className="px-5 py-12 text-center text-xs text-slate-400">
            {category !== "all" || tab !== "all"
              ? "Không có thông báo nào khớp bộ lọc này."
              : "Chưa có thông báo nào. Hộp thư chỉ ghi việc thật sự xảy ra: đơn từ được gửi hoặc được duyệt, doanh thu mở/chốt ca (kể cả khi lệch), ca làm việc được xếp hoặc đổi, chấm công bất thường (đi muộn, ngoài vùng, về sớm, vào ca lại, khiếu nại), và các thay đổi về nhân sự, chi nhánh, thiết bị."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((item) => {
              const group = notificationCategory(item.type);
              const Icon = group ? CATEGORY_ICONS[group] : Bell;
              // Where the row opens, decided through the same screen table `proxy.ts` reads — an
              // employee's timesheet notice lands on `/check-in`, a manager's on `/attendance`.
              const href = notificationHref(item, (path) =>
                canAccessScreen(profile?.role, path),
              );

              return (
                <li
                  key={item.id}
                  className={`flex items-start gap-3 px-4 py-3.5 ${
                    item.is_read ? "" : "bg-blue-50/40"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      item.is_read
                        ? "bg-slate-100 text-slate-500"
                        : "bg-blue-50 text-primary"
                    }`}
                  >
                    <Icon size={16} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {item.title}
                      </p>
                      {!item.is_read && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      )}
                    </div>
                    <p className="mt-0.5 whitespace-pre-line text-xs text-slate-600">
                      {item.body}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {formatDateTime(item.created_at)}
                      {group
                        ? ` · ${CATEGORY_LABELS[group]}`
                        : ` · ${notificationTypeLabel(item.type)}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {href && (
                      <Link
                        href={href}
                        onClick={() => void markRead(item)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-primary hover:bg-blue-50"
                      >
                        <ExternalLink size={12} />
                        Xem
                      </Link>
                    )}
                    {!item.is_read && (
                      <button
                        type="button"
                        onClick={() => void markRead(item)}
                        disabled={busyId === item.id}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {busyId === item.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Check size={12} />
                        )}
                        Đã đọc
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <span className="text-[10px] text-slate-500">
            {total === 0
              ? "Không có thông báo"
              : `Hiển thị ${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + notifications.length} trên tổng ${total}`}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setPage((current) => Math.max(1, current - 1));
              }}
              disabled={page <= 1 || loading}
              className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              ‹ Trước
            </button>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setPage((current) => Math.min(lastPage, current + 1));
              }}
              disabled={page >= lastPage || loading}
              className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              Sau ›
            </button>
          </div>
        </div>
      </section>

      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/40"
          role="dialog"
          aria-modal="true"
          aria-label="Cài đặt kênh nhận thông báo"
        >
          <div className="flex h-full w-full max-w-sm flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Kênh nhận thông báo</h2>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  Áp dụng cho tài khoản đang đăng nhập.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="Đóng"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {settingsLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                  <Loader2 size={16} className="animate-spin" />
                  Đang tải cài đặt...
                </div>
              ) : (
                channels.map((item) => (
                  <label
                    key={item.channel}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5"
                  >
                    <span>
                      <span className="block text-xs font-semibold text-slate-800">
                        {CHANNEL_LABELS[item.channel] ?? item.channel}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-slate-500">
                        {CHANNEL_NOTES[item.channel] ??
                          "Bật/tắt sẽ tạo hoặc cập nhật cấu hình cho kênh này."}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={(event) =>
                        void toggleChannel(item.channel, event.target.checked)
                      }
                      className="h-4 w-4 accent-primary"
                    />
                  </label>
                ))
              )}

              {/*
                The master switch is easy to leave off: the drawer used to render every channel as
                "off" (SCRUM-48 default) so a single toggle saved `in_app: false` for the whole
                account, and the inbox then stayed empty with nothing on screen to explain it
                (SCRUM-70 gates the fan-out on this switch).
              */}
              {channels.some(
                (item) => item.channel === "in_app" && !item.enabled,
              ) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                  Kênh &quot;Trong ứng dụng&quot; đang tắt nên bạn sẽ không nhận thông báo nào. Bật
                  lại để nhận thông báo mới.
                </div>
              )}

              {settingsError && (
                <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                  <AlertTriangle size={14} />
                  {settingsError}
                </div>
              )}

              {settingsSaved && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
                  <Check size={14} />
                  Đã lưu cài đặt kênh nhận.
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 px-5 py-3 text-[10px] text-slate-500">
              Thay đổi được lưu ngay khi gạt công tắc. Chỉ kênh &quot;Trong ứng dụng&quot; đang hoạt
              động: tắt nó thì hộp thư ngừng nhận thông báo mới (các thông báo cũ vẫn còn). Email và
              thông báo đẩy cần một dịch vụ gửi mà hệ thống chưa cấu hình.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}