"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  Loader2,
  Printer,
  RefreshCw,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { asArray } from "@/lib/asArray";
import { useLocale } from "@/components/LocaleProvider";
import type { Branch } from "@/lib/domain/entities/Branch";
import type {
  RevenueReportPeriod,
  RevenueReportPoint,
  RevenueReportResult,
} from "@/lib/domain/entities/RevenueReport";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
} from "@/lib/i18n/format";
import { errorMessageFor } from "@/lib/i18n/serverMessages";
import type { MessageKey } from "@/lib/i18n/translate";
import { getBusinessDay } from "@/lib/usecases/businessDay";

/** The period tabs, in reading order, and the sentence each one renders. */
const PERIODS: readonly RevenueReportPeriod[] = [
  "day",
  "week",
  "month",
  "quarter",
  "year",
];

const PERIOD_KEYS: Record<RevenueReportPeriod, MessageKey> = {
  day: "common.today",
  week: "period.thisWeek",
  month: "period.thisMonth",
  quarter: "period.thisQuarter",
  year: "period.thisYear",
};

const ALL_BRANCHES = "all";

export default function ReportsPage() {
  const { locale, t } = useLocale();
  const [period, setPeriod] = useState<RevenueReportPeriod>("month");
  const [branchId, setBranchId] = useState<string>(ALL_BRANCHES);
  const [date, setDate] = useState<string>(() => getBusinessDay(new Date()));
  const [branches, setBranches] = useState<Branch[]>([]);
  const [report, setReport] = useState<RevenueReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  // Branch list for the filter; a failure only hides the filter, never the report.
  useEffect(() => {
    let cancelled = false;

    fetch("/api/branches", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: Branch[]) => {
        if (!cancelled) {
          setBranches(asArray<Branch>(data));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<{
      report: RevenueReportResult | null;
      error: string | null;
    }> {
      const params = new URLSearchParams({ period, date });

      if (branchId !== ALL_BRANCHES) {
        params.set("branch_id", branchId);
      }

      const response = await fetch(`/api/revenue/report?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        return {
          report: null,
          error: errorMessageFor(response.status, data, t),
        };
      }

      return {
        report: (await response.json()) as RevenueReportResult,
        error: null,
      };
    }

    load()
      .then((result) => {
        if (cancelled) {
          return;
        }

        setReport(result.report);
        setPageError(result.error ?? "");
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setReport(null);
        setPageError(t("error.network"));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [period, branchId, date, reloadToken, t]);

  function refresh() {
    setLoading(true);
    setPageError("");
    setReloadToken((token) => token + 1);
  }

  const series = asArray<RevenueReportPoint>(report?.series);
  const summary = report?.summary ?? null;
  const comparison = report?.comparison ?? null;
  const maxRevenue = series.reduce(
    (max, point) => Math.max(max, point.total_revenue_amount),
    0,
  );
  const averagePerBucket =
    series.length > 0
      ? (summary?.total_revenue_amount ?? 0) / series.length
      : 0;
  const periodLabel = t(PERIOD_KEYS[period]);
  // A period with nothing before it has no percentage at all (`null` from the RPC), which is a sentence
  // rather than a number: the shared formatter takes a number and must not be handed a hole.
  const percentageChange = comparison?.percentage_change ?? null;
  const comparisonLabel =
    percentageChange === null || !Number.isFinite(percentageChange)
      ? t("reports.noComparison")
      : formatPercent(percentageChange, locale);
  const branchLabel =
    branchId === ALL_BRANCHES
      ? t("common.allBranches")
      : (branches.find((branch) => branch.id === branchId)?.name ??
        t("reports.branchPicked"));

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200/80 bg-surface p-5 shadow-sm lg:flex-row lg:items-center">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {t("reports.eyebrow")}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t("reports.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
            {t("reports.subtitleLead")}{" "}
            <b>{t("reports.subtitleSettled")}</b> {t("reports.subtitleTail")}{" "}
            <code className="rounded bg-slate-100 px-1">get_revenue_report</code>{" "}
            {t("reports.subtitleEnd")}
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
            {t("common.reload")}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Printer size={14} /> {t("reports.print")}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setLoading(true);
                setPeriod(value);
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                period === value
                  ? "bg-primary text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t(PERIOD_KEYS[value])}
            </button>
          ))}

          <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />

          <select
            value={branchId}
            onChange={(event) => {
              setLoading(true);
              setBranchId(event.target.value);
            }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-primary"
            aria-label={t("common.branch")}
          >
            <option value={ALL_BRANCHES}>{t("common.allBranches")}</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={date}
            onChange={(event) => {
              setLoading(true);
              setDate(event.target.value || getBusinessDay(new Date()));
            }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-primary"
            aria-label={t("reports.dateAria")}
          />

          <span className="ml-auto text-[10px] text-slate-500">
            {t("reports.periodSummary", { branch: branchLabel, period: periodLabel })}
          </span>
        </div>
      </section>

      {pageError && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle size={16} />
          {pageError}
        </div>
      )}

      {loading && !report ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" />
          {t("reports.loading")}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {t("reports.totalOpen")}
                </p>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-primary">
                  <Wallet size={16} />
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
                {formatCurrency(summary?.total_open_amount ?? 0, locale)}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                {t("reports.totalOpenNote")}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {t("reports.totalClose")}
                </p>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <CircleDollarSign size={16} />
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
                {formatCurrency(summary?.total_close_amount ?? 0, locale)}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                {t("reports.totalCloseNote", { count: summary?.record_count ?? 0 })}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {t("reports.netRevenue")}
                </p>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <TrendingUp size={16} />
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
                {formatCurrency(summary?.total_revenue_amount ?? 0, locale)}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                {t("reports.averageNote", { amount: formatCurrency(averagePerBucket, locale) })}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {t("reports.comparison")}
                </p>
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    (comparison?.difference ?? 0) < 0
                      ? "bg-rose-50 text-rose-600"
                      : "bg-emerald-50 text-emerald-600"
                  }`}
                >
                  {(comparison?.difference ?? 0) < 0 ? (
                    <ArrowDownRight size={16} />
                  ) : (
                    <ArrowUpRight size={16} />
                  )}
                </span>
              </div>
              <p
                className={`mt-2 text-2xl font-bold tabular-nums ${
                  (comparison?.difference ?? 0) < 0
                    ? "text-rose-600"
                    : "text-emerald-600"
                }`}
              >
                {formatSignedCurrency(comparison?.difference ?? 0, locale)}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                {t("reports.comparisonNote", {
                  percent: comparisonLabel,
                  amount: formatCurrency(
                    comparison?.previous_total_revenue_amount ?? 0,
                    locale,
                  ),
                })}
              </p>
            </div>
          </div>

          <section className="rounded-xl border border-slate-200/80 bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                {t("reports.chartTitle", {
                  unit:
                    period === "year" ? t("reports.unitMonth") : t("reports.unitDay"),
                })}
              </h2>
              <span className="text-[10px] text-slate-500">
                {t("reports.seriesCount", { count: series.length })}
              </span>
            </div>

            {series.length === 0 ? (
              <p className="py-12 text-center text-xs text-slate-400">
                {t("reports.emptyChart")}
              </p>
            ) : (
              <div className="mt-4 flex h-52 items-end gap-1">
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
                      title={t("reports.barTitle", {
                        bucket: point.bucket_start,
                        amount: formatCurrency(point.total_revenue_amount, locale),
                        count: point.record_count,
                      })}
                      className="flex-1 rounded-t bg-primary/80 transition-colors hover:bg-primary"
                      style={{ height: `${height}%` }}
                    />
                  );
                })}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-surface shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-bold text-slate-900">{t("reports.detailTitle")}</h2>
              <p className="mt-0.5 text-[10px] text-slate-500">
                {t("reports.detailNote", {
                  branch: branchLabel,
                  from: report?.range.start_at?.slice(0, 10) ?? "—",
                  to: report?.range.end_at?.slice(0, 10) ?? "—",
                })}
              </p>
            </div>

            {series.length === 0 ? (
              <p className="px-5 py-10 text-center text-xs text-slate-400">
                {t("reports.emptyTable")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">{t("reports.columnPeriod")}</th>
                      <th className="px-4 py-3 text-right font-semibold">{t("revenue.openAmount")}</th>
                      <th className="px-4 py-3 text-right font-semibold">{t("revenue.closeAmount")}</th>
                      <th className="px-4 py-3 text-right font-semibold">
                        {t("revenue.revenue")}
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">{t("reports.columnShifts")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {series.map((point) => (
                      <tr
                        key={point.bucket_start}
                        className="transition-colors hover:bg-blue-50/40"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-800">
                          {point.bucket_start}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                          {formatCurrency(point.total_open_amount, locale)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                          {formatCurrency(point.total_close_amount, locale)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-primary">
                          {formatCurrency(point.total_revenue_amount, locale)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                          {point.record_count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="border-t border-slate-100 px-4 py-3 text-[10px] text-slate-500">
              {t("reports.tableFooter", {
                periods: series.length,
                shifts: summary?.record_count ?? 0,
                amount: formatCurrency(summary?.total_revenue_amount ?? 0, locale),
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}