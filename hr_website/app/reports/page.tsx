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
import type { Branch } from "@/lib/domain/entities/Branch";
import type {
  RevenueReportPeriod,
  RevenueReportPoint,
  RevenueReportResult,
} from "@/lib/domain/entities/RevenueReport";
import { getBusinessDay } from "@/lib/usecases/businessDay";

const PERIOD_OPTIONS: { value: RevenueReportPeriod; label: string }[] = [
  { value: "day", label: "Hôm nay" },
  { value: "week", label: "Tuần này" },
  { value: "month", label: "Tháng này" },
  { value: "quarter", label: "Quý này" },
  { value: "year", label: "Năm nay" },
];

const ALL_BRANCHES = "all";

const currency = new Intl.NumberFormat("vi-VN");

function formatCurrency(value: number): string {
  return `${currency.format(Math.round(value))} ₫`;
}

/** Signed delta, so a shortage reads as a minus rather than as a smaller positive number. */
function formatDelta(value: number): string {
  return `${value > 0 ? "+" : ""}${currency.format(Math.round(value))} ₫`;
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "chưa có kỳ so sánh";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1).replace(".", ",")}%`;
}

export default function ReportsPage() {
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
          error:
            response.status === 401
              ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
              : (data?.error ?? "Không tải được báo cáo doanh thu."),
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
        setPageError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [period, branchId, date, reloadToken]);

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
  const branchLabel =
    branchId === ALL_BRANCHES
      ? "Tất cả chi nhánh"
      : (branches.find((branch) => branch.id === branchId)?.name ??
        "Chi nhánh đã chọn");

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200/80 bg-surface p-5 shadow-sm lg:flex-row lg:items-center">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Tài chính &amp; thu / SCRUM-44
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Báo cáo &amp; Phân tích Doanh thu
          </h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
            Doanh thu của các ca <b>đã chốt</b> (tiền cuối ca trừ tiền đầu ca), theo ngày kinh doanh
            Asia/Bangkok và so với kỳ liền trước. Số liệu do RPC{" "}
            <code className="rounded bg-slate-100 px-1">get_revenue_report</code> tổng hợp trong
            database, không phải dữ liệu mẫu.
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
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Printer size={14} /> In sổ sách
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setLoading(true);
                setPeriod(option.value);
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                period === option.value
                  ? "bg-primary text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {option.label}
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
            aria-label="Chi nhánh"
          >
            <option value={ALL_BRANCHES}>Tất cả chi nhánh</option>
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
            aria-label="Ngày trong kỳ"
          />

          <span className="ml-auto text-[10px] text-slate-500">
            {branchLabel} · kỳ {period}
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
          Đang tổng hợp doanh thu...
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Tổng tiền đầu ca
                </p>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-primary">
                  <Wallet size={16} />
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
                {formatCurrency(summary?.total_open_amount ?? 0)}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                Tiền mặt khai báo khi mở mỗi ca
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Tổng tiền cuối ca
                </p>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <CircleDollarSign size={16} />
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
                {formatCurrency(summary?.total_close_amount ?? 0)}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                Do {summary?.record_count ?? 0} ca đã chốt báo cáo
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Doanh thu thuần
                </p>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <TrendingUp size={16} />
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
                {formatCurrency(summary?.total_revenue_amount ?? 0)}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                Bình quân {formatCurrency(averagePerBucket)} mỗi mốc thời gian
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  So với kỳ trước
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
                {formatDelta(comparison?.difference ?? 0)}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                {formatPercent(comparison?.percentage_change ?? null)} · kỳ trước{" "}
                {formatCurrency(comparison?.previous_total_revenue_amount ?? 0)}
              </p>
            </div>
          </div>

          <section className="rounded-xl border border-slate-200/80 bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                Doanh thu theo {period === "year" ? "tháng" : "ngày"}
              </h2>
              <span className="text-[10px] text-slate-500">
                {series.length} mốc thời gian có doanh thu
              </span>
            </div>

            {series.length === 0 ? (
              <p className="py-12 text-center text-xs text-slate-400">
                Kỳ này chưa có ca nào được chốt. Doanh thu chỉ xuất hiện sau khi ca được chốt trong
                mục Doanh thu.
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
                      title={`${point.bucket_start}: ${formatCurrency(point.total_revenue_amount)} (${point.record_count} ca)`}
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
              <h2 className="text-sm font-bold text-slate-900">Chi tiết theo mốc thời gian</h2>
              <p className="mt-0.5 text-[10px] text-slate-500">
                {branchLabel} · từ {report?.range.start_at?.slice(0, 10)} đến{" "}
                {report?.range.end_at?.slice(0, 10)} (UTC)
              </p>
            </div>

            {series.length === 0 ? (
              <p className="px-5 py-10 text-center text-xs text-slate-400">
                Không có dữ liệu để hiển thị.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Mốc thời gian</th>
                      <th className="px-4 py-3 text-right font-semibold">Tiền đầu ca</th>
                      <th className="px-4 py-3 text-right font-semibold">Tiền cuối ca</th>
                      <th className="px-4 py-3 text-right font-semibold">Doanh thu</th>
                      <th className="px-4 py-3 text-right font-semibold">Số ca</th>
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
                          {formatCurrency(point.total_open_amount)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                          {formatCurrency(point.total_close_amount)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-primary">
                          {formatCurrency(point.total_revenue_amount)}
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
              {series.length} mốc thời gian · {summary?.record_count ?? 0} ca đã chốt · tổng doanh
              thu {formatCurrency(summary?.total_revenue_amount ?? 0)}
            </div>
          </section>
        </>
      )}
    </div>
  );
}