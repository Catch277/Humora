"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Clock3,
  Loader2,
  RefreshCw,
} from "lucide-react";

import BranchBarList, {
  type BranchBarRow,
} from "@/components/charts/BranchBarList";
import ColumnChart, {
  type ColumnChartPoint,
} from "@/components/charts/ColumnChart";
import DonutChart, { type DonutSlice } from "@/components/charts/DonutChart";
import { useLocale } from "@/components/LocaleProvider";
import { useProfile } from "@/components/ProfileProvider";
import { asArray } from "@/lib/asArray";
import { canManageBranch, viewerFromRole } from "@/lib/domain/branchScope";
import type {
  DashboardBranchStatistics,
  DashboardPeriod,
  DashboardRevenueBranchPoint,
  DashboardSeriesPoint,
  DashboardStatistics,
} from "@/lib/domain/entities/DashboardStatistics";
import {
  formatCurrency,
  formatDayMonth,
  formatNumber,
  formatPercent,
  formatRatio,
  formatTime,
} from "@/lib/i18n/format";
import { errorMessageFor } from "@/lib/i18n/serverMessages";
import { getBusinessDay } from "@/lib/usecases/businessDay";

/** SCRUM-63 needs `manager_id`: it is what says whether the caller heads the branch. */
type BranchOption = { id: string; name: string; manager_id: string | null };

type StatisticsResult = {
  statistics: DashboardStatistics | null;
  error: string;
};

const ALL = "all";

/** A dashboard whose numbers move during the day refreshes itself like the giám sát screens do. */
const POLL_INTERVAL_MS = 60_000;

/** `2026-11` → `11/2026`, `2026-11-15` → `15/11` — the API sends business dates, never instants. */
function bucketLabel(bucket: string): string {
  if (/^\d{4}-\d{2}$/.test(bucket)) {
    const [year, month] = bucket.split("-");

    return `${month}/${year}`;
  }

  return formatDayMonth(bucket);
}

/** `part / total` as a percentage; `0` when there is nothing to divide. */
function percentageOf(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

const PERIOD_TABS = [
  { value: "day", key: "dashboard.charts.periodDay" },
  { value: "month", key: "dashboard.charts.periodMonth" },
  { value: "year", key: "dashboard.charts.periodYear" },
] as const;

const BRANCH_METRIC_TABS = [
  { value: "employees", key: "dashboard.charts.branchesEmployees" },
  { value: "attendance", key: "dashboard.charts.branchesAttendance" },
  { value: "revenue", key: "dashboard.charts.branchesRevenue" },
] as const;

export default function DashboardCharts() {
  const { locale, t } = useLocale();
  const { profile, loading: profileLoading } = useProfile();
  // The screen's own branch rule (SCRUM-63), derived the same way `/schedules` does it — never from
  // a capability, because a half-loaded profile would send an owner down the branch-scoped path.
  const viewer = viewerFromRole(profile?.role, profile?.id ?? null);
  const managesAllBranches = viewer.managesAllBranches;

  const [period, setPeriod] = useState<DashboardPeriod>("month");
  const [date, setDate] = useState(() => getBusinessDay(new Date()));
  const [branchFilter, setBranchFilter] = useState(ALL);
  const [revenueView, setRevenueView] = useState<"time" | "branch">("time");
  const [branchMetric, setBranchMetric] = useState<
    "employees" | "attendance" | "revenue"
  >("employees");
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [selectedSlice, setSelectedSlice] = useState<string | null>(null);
  // A second selection for the workforce donut: one shared key would dim every slice of the other
  // card, because the two pies do not have a slice in common.
  const [selectedWorkforceSlice, setSelectedWorkforceSlice] = useState<
    string | null
  >(null);
  const [statistics, setStatistics] = useState<DashboardStatistics | null>(null);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  // The branch picker is read once per refresh rather than on every poll: a branch is renamed rarely,
  // and a failed list only costs the filter options (the charts still answer for the caller's scope).
  useEffect(() => {
    if (profileLoading) {
      return;
    }

    let cancelled = false;

    fetch("/api/branches", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((payload: unknown) => {
        if (!cancelled) {
          setBranches(asArray<BranchOption>(payload));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBranches([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [profileLoading, reloadToken]);

  useEffect(() => {
    // Wait for the role: while it is unknown the request would answer `403`.
    if (profileLoading) {
      return;
    }

    let cancelled = false;

    async function load(): Promise<StatisticsResult> {
      const params = new URLSearchParams({ period, date });

      if (branchFilter !== ALL) {
        params.set("branch_id", branchFilter);
      }

      const response = await fetch(
        `/api/dashboard/statistics?${params.toString()}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        return {
          statistics: null,
          // The server's own sentence for a `500` names the missing script in Vietnamese; this screen
          // owns the wording, so an English reader gets the dictionary sentence instead.
          error: errorMessageFor(response.status, body, t, {
            500: "dashboard.charts.loadFailed",
          }),
        };
      }

      return {
        statistics: (await response.json()) as DashboardStatistics,
        error: "",
      };
    }

    function apply(result: StatisticsResult) {
      if (cancelled) {
        return;
      }

      setStatistics(result.statistics);
      setPageError(result.error);
      setUpdatedAt(new Date().toISOString());
      setLoading(false);
    }

    function fail() {
      if (cancelled) {
        return;
      }

      setPageError(t("error.network"));
      setLoading(false);
    }

    load().then(apply).catch(fail);

    // Paused while the tab is hidden, so a background tab does not spend the session's quota.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        load().then(apply).catch(fail);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [period, date, branchFilter, reloadToken, profileLoading, t]);

  function refresh() {
    setLoading(true);
    setPageError("");
    setReloadToken((token) => token + 1);
  }

  function choosePeriod(next: DashboardPeriod) {
    setLoading(true);
    setSelectedBucket(null);
    setPeriod(next);
  }

  function chooseBranch(next: string) {
    setLoading(true);
    setSelectedBucket(null);
    setBranchFilter(next);
  }

  /**
   * Clicking a column drills down instead of only highlighting it: a month column opens that day, a
   * year column opens that month. Every card re-reads from the same request, which is what makes the
   * four charts describe one slice of the operation.
   */
  function drillDown(bucket: string) {
    setSelectedBucket(bucket);

    if (period === "year" && /^\d{4}-\d{2}$/.test(bucket)) {
      setLoading(true);
      setPeriod("month");
      setDate(`${bucket}-01`);
    } else if (period === "month" && /^\d{4}-\d{2}-\d{2}$/.test(bucket)) {
      setLoading(true);
      setPeriod("day");
      setDate(bucket);
    }
  }

  const revenue = statistics?.revenue ?? null;
  const attendance = statistics?.attendance ?? null;
  const workforce = statistics?.workforce ?? null;
  const series = asArray<DashboardSeriesPoint>(revenue?.series);
  const branchRows = asArray<DashboardBranchStatistics>(statistics?.branches);
  const scopedBranches = branches.filter((branch) =>
    canManageBranch(branch, viewer),
  );
  const activeBranchName =
    scopedBranches.find((branch) => branch.id === branchFilter)?.name ?? null;
  const revenueChange = revenue?.percentage_change ?? null;

  const revenuePoints: ColumnChartPoint[] = series.map((point) => ({
    key: point.bucket,
    label: bucketLabel(point.bucket),
    value: point.total_revenue,
    valueLabel: formatCurrency(point.total_revenue, locale),
    note:
      point.record_count > 0
        ? t("dashboard.charts.revenueRecords", { count: point.record_count })
        : undefined,
  }));

  const revenueBranchRaw = asArray<DashboardRevenueBranchPoint>(
    revenue?.by_branch,
  );
  const maxBranchRevenue = revenueBranchRaw.reduce(
    (peak, point) => Math.max(peak, point.total_revenue),
    0,
  );
  const revenueBranchRows: BranchBarRow[] = revenueBranchRaw.map((point) => ({
    key: point.branch_id ?? "unassigned",
    name: point.branch_name || t("dashboard.charts.branchesUnassigned"),
    valueLabel: formatCurrency(point.total_revenue, locale),
    ratioLabel: formatRatio(
      percentageOf(point.total_revenue, revenue?.total ?? 0),
      locale,
    ),
    barRatio: percentageOf(point.total_revenue, maxBranchRevenue),
    note: t("dashboard.charts.revenueRecords", { count: point.record_count }),
    disabled: point.branch_id === null,
  }));

  const attendanceTotal = attendance?.total ?? 0;
  const absentTotal = (attendance?.absent ?? 0) + (attendance?.no_show ?? 0);
  const attendanceSlices: DonutSlice[] = (
    [
      {
        key: "on_time",
        label: t("dashboard.charts.attendanceOnTime"),
        value: attendance?.on_time ?? 0,
        tone: "emerald",
      },
      {
        key: "late",
        label: t("dashboard.charts.attendanceLate"),
        value: attendance?.late ?? 0,
        tone: "amber",
      },
      {
        key: "early_leave",
        label: t("dashboard.charts.attendanceEarlyLeave"),
        value: attendance?.early_leave ?? 0,
        tone: "primary",
      },
      {
        key: "incomplete",
        label: t("dashboard.charts.attendanceIncomplete"),
        value: attendance?.incomplete ?? 0,
        tone: "slate",
      },
      {
        key: "absent",
        label: t("dashboard.charts.attendanceAbsent"),
        value: absentTotal,
        tone: "rose",
      },
    ] as const
  ).map((slice) => ({
    key: slice.key,
    label: slice.label,
    value: slice.value,
    tone: slice.tone,
    valueLabel: t("dashboard.charts.sliceValue", {
      count: formatNumber(slice.value, locale),
      percent: formatRatio(percentageOf(slice.value, attendanceTotal), locale),
    }),
  }));
  const workforceTotal = workforce?.total ?? 0;
  const workforceSlices: DonutSlice[] = (
    [
      {
        key: "active",
        label: t("dashboard.charts.workforceActive"),
        value: workforce?.active ?? 0,
        tone: "emerald",
      },
      {
        key: "resigned",
        label: t("dashboard.charts.workforceResigned"),
        value: workforce?.resigned ?? 0,
        tone: "slate",
      },
    ] as const
  ).map((slice) => ({
    key: slice.key,
    label: slice.label,
    value: slice.value,
    tone: slice.tone,
    valueLabel: t("dashboard.charts.sliceValue", {
      count: formatNumber(slice.value, locale),
      percent: formatRatio(percentageOf(slice.value, workforceTotal), locale),
    }),
  }));

  const metricValue = (row: DashboardBranchStatistics): number => {
    if (branchMetric === "employees") {
      return row.employee_active;
    }

    if (branchMetric === "attendance") {
      return row.attendance_total + row.no_show_total;
    }

    return row.revenue_total;
  };

  const sortedBranchRows = [...branchRows].sort(
    (left, right) => metricValue(right) - metricValue(left),
  );
  const maxMetric = sortedBranchRows.reduce(
    (peak, row) => Math.max(peak, metricValue(row)),
    0,
  );
  const totalMetric = sortedBranchRows.reduce(
    (sum, row) => sum + metricValue(row),
    0,
  );

  const branchBarRows: BranchBarRow[] = sortedBranchRows.map((row) => {
    const value = metricValue(row);
    const name =
      row.branch_id === null
        ? t("dashboard.charts.branchesUnassigned")
        : row.branch_name;
    const note =
      branchMetric === "employees"
        ? t("dashboard.charts.branchesEmployeesNote", {
            active: formatNumber(row.employee_active, locale),
            total: formatNumber(row.employee_total, locale),
          })
        : branchMetric === "attendance"
          ? row.attendance_rate === null
            ? t("dashboard.charts.empty")
            : t("dashboard.charts.branchesAttendanceNote", {
                percent: formatRatio(row.attendance_rate, locale),
              })
          : t("dashboard.charts.branchesRevenueNote", {
              count: formatNumber(row.revenue_records, locale),
            });

    return {
      key: row.branch_id ?? "unassigned",
      name,
      valueLabel:
        branchMetric === "revenue"
          ? formatCurrency(value, locale)
          : formatNumber(value, locale),
      ratioLabel: formatRatio(percentageOf(value, totalMetric), locale),
      barRatio: percentageOf(value, maxMetric),
      note,
      disabled: row.branch_id === null,
    };
  });

  const scopeIsEmpty = !managesAllBranches && scopedBranches.length === 0;

  return (
    <section className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm sm:p-5">
      <header className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <BarChart3 size={12} />
            {t("dashboard.charts.title")}
          </p>
          <p className="text-[11px] text-slate-500">
            {t("dashboard.charts.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-[10px] text-slate-500">
            <Clock3 size={12} className="text-slate-400" />
            {t("dashboard.charts.updatedAt", {
              time: formatTime(updatedAt, locale, "--:--"),
            })}
          </span>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {t("common.reload")}
          </button>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label={t("dashboard.charts.periodAria")}
          className="flex rounded-lg border border-slate-200 p-0.5"
        >
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => choosePeriod(tab.value)}
              aria-pressed={period === tab.value}
              className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                period === tab.value
                  ? "bg-primary text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t(tab.key)}
            </button>
          ))}
        </div>

        <input
          type="date"
          value={date}
          onChange={(event) => {
            setLoading(true);
            setSelectedBucket(null);
            setDate(event.target.value || getBusinessDay(new Date()));
          }}
          aria-label={t("dashboard.charts.dateAria")}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-primary"
        />

        <select
          value={branchFilter}
          onChange={(event) => chooseBranch(event.target.value)}
          aria-label={t("dashboard.charts.branchAria")}
          className="max-w-[220px] rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-primary"
        >
          <option value={ALL}>{t("dashboard.charts.allBranches")}</option>
          {scopedBranches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>

        {branchFilter !== ALL && (
          <button
            type="button"
            onClick={() => chooseBranch(ALL)}
            className="rounded-lg border border-primary/40 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-primary"
          >
            {t("dashboard.charts.clearBranch")}
          </button>
        )}

        <span className="ml-auto text-[10px] text-slate-500">
          {activeBranchName ?? t("dashboard.charts.allBranches")}
        </span>
      </div>

      {pageError && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle size={16} />
          {pageError}
        </div>
      )}

      {loading && !statistics ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" />
          {t("dashboard.charts.loading")}
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <article className="flex flex-col rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                {t("dashboard.charts.revenueTitle")}
              </h3>
              <div
                role="group"
                aria-label={t("dashboard.charts.revenueTitle")}
                className="flex rounded-lg border border-slate-200 p-0.5"
              >
                <button
                  type="button"
                  onClick={() => setRevenueView("time")}
                  aria-pressed={revenueView === "time"}
                  className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
                    revenueView === "time"
                      ? "bg-primary text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {t("dashboard.charts.revenueByTime")}
                </button>
                <button
                  type="button"
                  onClick={() => setRevenueView("branch")}
                  aria-pressed={revenueView === "branch"}
                  className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
                    revenueView === "branch"
                      ? "bg-primary text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {t("dashboard.charts.revenueByBranch")}
                </button>
              </div>
            </header>

            <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-2xl font-bold tabular-nums text-slate-900">
                {formatCurrency(revenue?.total ?? 0, locale)}
              </p>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  revenueChange === null
                    ? "bg-slate-100 text-slate-600"
                    : revenueChange < 0
                      ? "bg-rose-50 text-rose-600"
                      : "bg-emerald-50 text-emerald-600"
                }`}
              >
                {revenueChange === null
                  ? t("dashboard.charts.revenueNoPrevious")
                  : `${formatPercent(revenueChange, locale)} ${t("dashboard.vsPrevious")}`}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              {t("dashboard.charts.revenuePrevious", {
                amount: formatCurrency(revenue?.previous_total ?? 0, locale),
              })}
              {" · "}
              {t("dashboard.charts.revenueFootnote", {
                buckets: formatNumber(series.length, locale),
                records: formatNumber(revenue?.record_count ?? 0, locale),
              })}
            </p>

            {revenueView === "time" ? (
              <ColumnChart
                points={revenuePoints}
                ariaLabel={t("dashboard.charts.revenueTitle")}
                emptyLabel={t("dashboard.charts.empty")}
                selectedKey={selectedBucket}
                onSelect={drillDown}
              />
            ) : (
              <BranchBarList
                rows={revenueBranchRows}
                ariaLabel={t("dashboard.charts.revenueByBranch")}
                emptyLabel={t("dashboard.charts.empty")}
                selectedKey={branchFilter === ALL ? null : branchFilter}
                onSelect={chooseBranch}
              />
            )}

            {selectedBucket && revenueView === "time" && (
              <p className="mt-2 text-[10px] font-medium tabular-nums text-primary">
                {t("dashboard.charts.revenueSelected", {
                  bucket: bucketLabel(selectedBucket),
                  amount: formatCurrency(
                    series.find((point) => point.bucket === selectedBucket)
                      ?.total_revenue ?? 0,
                    locale,
                  ),
                })}
              </p>
            )}

            <p className="mt-auto pt-2 text-[10px] text-slate-400">
              {t("dashboard.charts.hint")}
            </p>
          </article>
          <article className="flex flex-col rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
            <header className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                {t("dashboard.charts.attendanceTitle")}
              </h3>
              <span className="text-[10px] tabular-nums text-slate-500">
                {t("dashboard.charts.attendanceTotal", {
                  count: formatNumber(attendanceTotal, locale),
                })}
              </span>
            </header>

            <DonutChart
              slices={attendanceSlices}
              ariaLabel={t("dashboard.charts.attendanceTitle")}
              emptyLabel={t("dashboard.charts.empty")}
              centerValue={formatNumber(attendanceTotal, locale)}
              centerCaption={t("dashboard.charts.attendanceCentre")}
              selectedKey={selectedSlice}
              onSelect={(key) =>
                setSelectedSlice((current) => (current === key ? null : key))
              }
            />

            <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-3 text-[10px] text-slate-500">
              <span className="font-semibold text-slate-700">
                {t("dashboard.charts.attendanceRate", {
                  percent:
                    attendance?.attendance_rate === null ||
                    attendance?.attendance_rate === undefined
                      ? "—"
                      : formatRatio(attendance.attendance_rate, locale),
                })}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {t("dashboard.charts.attendanceNoShow", {
                  count: formatNumber(attendance?.no_show ?? 0, locale),
                })}
              </span>
            </div>
          </article>

          <article className="flex flex-col rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
            <header className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                {t("dashboard.charts.workforceTitle")}
              </h3>
              <span className="text-[10px] tabular-nums text-slate-500">
                {t("dashboard.charts.workforceActiveRate", {
                  percent:
                    workforce?.active_rate === null ||
                    workforce?.active_rate === undefined
                      ? "—"
                      : formatRatio(workforce.active_rate, locale),
                })}
              </span>
            </header>

            <DonutChart
              slices={workforceSlices}
              ariaLabel={t("dashboard.charts.workforceTitle")}
              emptyLabel={t("dashboard.charts.empty")}
              centerValue={formatNumber(workforceTotal, locale)}
              centerCaption={t("dashboard.charts.workforceTotal")}
              selectedKey={selectedWorkforceSlice}
              onSelect={(key) =>
                setSelectedWorkforceSlice((current) =>
                  current === key ? null : key,
                )
              }
            />

            <dl className="mt-auto grid grid-cols-3 gap-2 pt-3">
              <div>
                <dt className="text-[9px] uppercase tracking-wide text-slate-400">
                  {t("dashboard.charts.workforceWorking")}
                </dt>
                <dd className="text-sm font-bold tabular-nums text-slate-900">
                  {formatNumber(workforce?.working ?? 0, locale)}
                </dd>
              </div>
              <div>
                <dt className="text-[9px] uppercase tracking-wide text-slate-400">
                  {t("dashboard.charts.workforceAbsent")}
                </dt>
                <dd className="text-sm font-bold tabular-nums text-rose-600">
                  {formatNumber(workforce?.absent ?? 0, locale)}
                </dd>
              </div>
              <div>
                <dt className="text-[9px] uppercase tracking-wide text-slate-400">
                  {t("dashboard.charts.workforceActive")}
                </dt>
                <dd className="text-sm font-bold tabular-nums text-slate-900">
                  {formatNumber(workforce?.active ?? 0, locale)}
                </dd>
              </div>
            </dl>
          </article>
          <article className="flex flex-col rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                {t("dashboard.charts.branchesTitle")}
              </h3>
              <div
                role="group"
                aria-label={t("dashboard.charts.branchesTitle")}
                className="flex rounded-lg border border-slate-200 p-0.5"
              >
                {BRANCH_METRIC_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setBranchMetric(tab.value)}
                    aria-pressed={branchMetric === tab.value}
                    className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
                      branchMetric === tab.value
                        ? "bg-primary text-white"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {t(tab.key)}
                  </button>
                ))}
              </div>
            </header>

            {branchBarRows.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-400">
                {scopeIsEmpty
                  ? t("dashboard.charts.branchesNoScope")
                  : t("dashboard.charts.branchesEmpty")}
              </p>
            ) : (
              <BranchBarList
                rows={branchBarRows}
                ariaLabel={t("dashboard.charts.branchesTitle")}
                emptyLabel={t("dashboard.charts.branchesEmpty")}
                selectedKey={branchFilter === ALL ? null : branchFilter}
                onSelect={chooseBranch}
              />
            )}

            <p className="mt-auto pt-2 text-[10px] text-slate-400">
              {t("dashboard.charts.hint")}
            </p>
          </article>
        </div>
      )}
    </section>
  );
}
