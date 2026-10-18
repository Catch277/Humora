"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarCheck,
  CalendarDays,
  CircleDollarSign,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";

import { useLocale } from "@/components/LocaleProvider";
import { useProfile } from "@/components/ProfileProvider";
import { asArray, asArrayField } from "@/lib/asArray";
import type { Attendance } from "@/lib/domain/entities/Attendance";
import type { EmployeeStatus } from "@/lib/domain/entities/EmployeeStatus";
import type { RequestEntity } from "@/lib/domain/entities/RequestEntity";
import type {
  RevenueReportPoint,
  RevenueReportResult,
} from "@/lib/domain/entities/RevenueReport";
import { formatCurrency, formatDateTime, formatPercent } from "@/lib/i18n/format";
import { requestStatusLabel } from "@/lib/i18n/labels";
import type { Locale } from "@/lib/i18n/locales";
import type { Translate } from "@/lib/i18n/translate";
import { getBusinessDay } from "@/lib/usecases/businessDay";

const REQUEST_STATUS_TONES: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-rose-50 text-rose-700",
};

/**
 * The dashboard tile row is smaller for a role that may not see the roster (`employee-status:view`) or
 * the revenue report (`report:view`). Written as literals so Tailwind's scanner finds them.
 */
const TILE_GRID_CLASSES: Record<number, string> = {
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

/**
 * `+4,2% so với kỳ trước`, or the "nothing to compare yet" sentence.
 *
 * One helper on purpose: a missing comparison rendered as `0%` would read as "no change" instead of "we
 * have no previous period to compare with".
 */
function comparisonLabel(
  value: number | null | undefined,
  locale: Locale,
  t: Translate,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return t("dashboard.noComparison");
  }

  return `${formatPercent(value, locale)} ${t("dashboard.vsPrevious")}`;
}

/** `/api/employee-status` answers the snapshot the giám sát screen polls, not a bare array. */
type EmployeeStatusSnapshot = {
  updated_at: string;
  work_date: string;
  data: EmployeeStatus[];
};

type DashboardData = {
  roster: EmployeeStatus[];
  /** The business day the API answered for (Asia/Bangkok); empty when that call failed. */
  workDate: string;
  requests: RequestEntity[];
  attendance: Attendance[];
  report: RevenueReportResult | null;
};

export default function Dashboard() {
  // SCRUM-59: the roster and the revenue report are management views, so an employee's dashboard must
  // neither fetch them (that would render a permanent "Không tải được" banner for a `403` the role
  // cannot avoid) nor show a tile that would read zero. The two tiles are therefore derived from the
  // same capability table the sidebar uses.
  const { locale, t } = useLocale();
  const { can, loading: profileLoading } = useProfile();
  const canViewRoster = can("employee-status:view");
  const canViewReport = can("report:view");

  const [data, setData] = useState<DashboardData>({
    roster: [],
    workDate: "",
    requests: [],
    attendance: [],
    report: null,
  });
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  // `getBusinessDay` is a pure Asia/Bangkok helper, so the client computes the same business day the
  // API filters by; the browser/server clock would report the previous day between 00:00 and 07:00.
  const today = getBusinessDay(new Date());

  useEffect(() => {
    // Wait for the role: which tiles exist (and therefore which endpoints may be called) depends on
    // it, and `can()` answers `false` while the profile is still unknown.
    if (profileLoading) {
      return;
    }

    let cancelled = false;

    async function load(): Promise<DashboardData & { error: string | null }> {
      const [rosterResponse, requestsResponse, attendanceResponse, reportResponse] =
        await Promise.all([
          canViewRoster
            ? fetch("/api/employee-status", { cache: "no-store" })
            : null,
          fetch("/api/requests?status=all", { cache: "no-store" }),
          fetch(`/api/attendance?start_date=${today}`, { cache: "no-store" }),
          canViewReport
            ? fetch("/api/revenue/report?period=month", { cache: "no-store" })
            : null,
        ]);

      // The dashboard is a summary, so one failing tile must not blank the page: every response is
      // read on its own and the note names the part that is missing. A tile this role may not see was
      // never fetched, so `null` here is not a failure.
      const failed = [
        rosterResponse && !rosterResponse.ok ? t("dashboard.part.roster") : "",
        requestsResponse.ok ? "" : t("dashboard.part.requests"),
        attendanceResponse.ok ? "" : t("dashboard.part.attendance"),
      ].filter(Boolean);

      // `/api/employee-status` answers `{ updated_at, work_date, data }`; the other three answer bare
      // arrays. `asArray`/`asArrayField` keep a surprise body from throwing while the page renders.
      const snapshot = rosterResponse?.ok
        ? ((await rosterResponse.json()) as EmployeeStatusSnapshot)
        : null;

      return {
        roster: asArrayField<EmployeeStatus>(snapshot, "data"),
        workDate: snapshot?.work_date ?? "",
        requests: requestsResponse.ok
          ? asArray<RequestEntity>(await requestsResponse.json())
          : [],
        attendance: attendanceResponse.ok
          ? asArray<Attendance>(await attendanceResponse.json())
          : [],
        report: reportResponse?.ok
          ? ((await reportResponse.json()) as RevenueReportResult)
          : null,
        error:
          failed.length > 0
            ? t("dashboard.loadFailed", { parts: failed.join(", ") })
            : reportResponse && !reportResponse.ok
              ? t("dashboard.reportFailed")
              : "",
      };
    }

    load()
      .then((result) => {
        if (cancelled) {
          return;
        }

        setData({
          roster: result.roster,
          workDate: result.workDate,
          requests: result.requests,
          attendance: result.attendance,
          report: result.report,
        });
        setPageError(result.error ?? "");
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setPageError(t("error.network"));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [today, reloadToken, profileLoading, canViewRoster, canViewReport, t]);

  function refresh() {
    setLoading(true);
    setPageError("");
    setReloadToken((token) => token + 1);
  }

  const workingCount = data.roster.filter((row) => row.status === "WORKING").length;
  const pendingRequests = data.requests.filter((row) => row.status === "PENDING");
  const onTimeCount = data.attendance.filter((row) => row.status === "ON_TIME").length;
  const lateCount = data.attendance.filter((row) => row.status === "LATE").length;
  const recentRequests = data.requests.slice(0, 6);
  const series = asArray<RevenueReportPoint>(data.report?.series);
  const maxRevenue = series.reduce(
    (max, point) => Math.max(max, point.total_revenue_amount),
    0,
  );
  // Read the summary through a local: `data.report?.summary.total_revenue_amount` would throw if the
  // report body ever came back as something other than the documented object.
  const summary = data.report?.summary ?? null;
  const monthRevenue = summary?.total_revenue_amount ?? 0;
  const comparison = data.report?.comparison ?? null;
  const visibleTileCount = 2 + (canViewRoster ? 1 : 0) + (canViewReport ? 1 : 0);
  // Prefer the business day the API answered for; the local computation is the fallback when that
  // call failed, so the header always names a date.
  const businessDate = data.workDate || today;

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200/80 bg-surface p-5 shadow-sm lg:flex-row lg:items-center">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Humora HR
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t("nav.dashboard")}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {t("dashboard.subtitle", { date: businessDate })}
            {canViewReport ? t("dashboard.sourcesAll") : t("dashboard.sourcesOwn")}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {t("common.reload")}
        </button>
      </section>

      {pageError && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle size={16} />
          {pageError}
        </div>
      )}

      <div
        className={`grid gap-4 sm:grid-cols-2 ${TILE_GRID_CLASSES[visibleTileCount] ?? "lg:grid-cols-4"}`}
      >
        {canViewRoster && (
          <div className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {t("dashboard.tileRoster")}
              </p>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-primary">
                <Users size={16} />
              </span>
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
              {data.roster.length}
            </p>
            <p className="mt-1 text-[10px] text-slate-500">
              {t("dashboard.tileRosterNote", { count: workingCount })}
            </p>
          </div>
        )}

        {canViewReport && (
          <div className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {t("dashboard.tileRevenue")}
              </p>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <CircleDollarSign size={16} />
              </span>
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
              {formatCurrency(monthRevenue, locale)}
            </p>
            <p
              className={`mt-1 flex items-center gap-1 text-[10px] ${
                (comparison?.percentage_change ?? 0) < 0
                  ? "text-rose-600"
                  : "text-emerald-600"
              }`}
            >
              <TrendingUp size={11} />
              {comparisonLabel(comparison?.percentage_change ?? null, locale, t)}
            </p>
          </div>
        )}

        <div className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {t("dashboard.tileRequests")}
            </p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <CalendarDays size={16} />
            </span>
          </div>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
            {pendingRequests.length}
          </p>
          <p className="mt-1 text-[10px] text-amber-600">
            {t("dashboard.tileRequestsNote", { count: data.requests.length })}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {t("dashboard.tileAttendance")}
            </p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <CalendarCheck size={16} />
            </span>
          </div>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
            {data.attendance.length}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            {t("dashboard.tileAttendanceNoteBefore", { onTime: onTimeCount })}
            <span className="text-amber-600">
              {t("dashboard.tileAttendanceNoteAfter", { late: lateCount })}
            </span>
          </p>
        </div>
      </div>

      <div className={`grid gap-4 ${canViewReport ? "lg:grid-cols-2" : ""}`}>
        <section className="flex flex-col rounded-xl border border-slate-200/80 bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              {t("dashboard.recentRequests")}
            </h2>
            <a
              href="/requests"
              className="text-[11px] font-semibold text-primary hover:underline"
            >
              {t("common.viewAll")}
            </a>
          </div>

          {recentRequests.length === 0 ? (
            <p className="flex flex-1 items-center justify-center py-12 text-center text-xs text-slate-400">
              {t("dashboard.noRequests")}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {recentRequests.map((request) => (
                <li key={request.id} className="flex items-start gap-3 py-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[10px] font-bold text-primary">
                    {(request.requester?.full_name ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-800">
                      {request.title ?? request.request_type}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {request.requester?.full_name ?? t("dashboard.unknownRequester")} ·{" "}
                      {formatDateTime(request.created_at, locale)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ${
                      REQUEST_STATUS_TONES[request.status] ??
                      "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {requestStatusLabel(request.status, t)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {canViewReport && (
        <section className="flex flex-col rounded-xl border border-slate-200/80 bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              {t("dashboard.revenueByDay")}
            </h2>
            <span className="text-[11px] font-semibold tabular-nums text-slate-600">
              {formatCurrency(monthRevenue, locale)}
            </span>
          </div>

          {series.length === 0 ? (
            <p className="flex flex-1 items-center justify-center py-12 text-center text-xs text-slate-400">
              {t("dashboard.noRevenue")}
            </p>
          ) : (
            <>
              <div className="mt-4 flex h-40 items-end gap-1">
                {series.map((point) => {
                  const height =
                    maxRevenue > 0
                      ? Math.max(
                          2,
                          Math.round(
                            (point.total_revenue_amount / maxRevenue) * 100,
                          ),
                        )
                      : 2;

                  return (
                    <div
                      key={point.bucket_start}
                      title={t("dashboard.pointTitle", {
                        date: point.bucket_start,
                        amount: formatCurrency(point.total_revenue_amount, locale),
                        count: point.record_count,
                      })}
                      className="flex-1 rounded-t bg-primary/80 transition-colors hover:bg-primary"
                      style={{ height: `${height}%` }}
                    />
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                <span>{series[0]?.bucket_start}</span>
                <span>
                  {t("dashboard.seriesSummary", {
                    days: series.length,
                    shifts: summary?.record_count ?? 0,
                  })}
                </span>
                <span>{series[series.length - 1]?.bucket_start}</span>
              </div>
            </>
          )}
        </section>
        )}
      </div>
    </div>
  );
}
