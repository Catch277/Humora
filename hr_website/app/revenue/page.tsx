"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CircleDollarSign,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Unlock,
  Wallet,
} from "lucide-react";

import { useLocale } from "@/components/LocaleProvider";
import { useProfile } from "@/components/ProfileProvider";
import { asArray } from "@/lib/asArray";
import { canManageBranch, defaultBranchId } from "@/lib/domain/branchScope";
import type { Branch } from "@/lib/domain/entities/Branch";
import type { RevenueRecord } from "@/lib/domain/entities/RevenueRecord";
import { formatCurrency, formatDateTime } from "@/lib/i18n/format";
import { errorMessageFor } from "@/lib/i18n/serverMessages";
import { getBusinessDay } from "@/lib/usecases/businessDay";

/** Vietnamese cash denominations, largest first — the order a drawer is counted in. */
const DENOMINATIONS = [
  500_000, 200_000, 100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000,
];

const inputClassName =
  "w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-500/15";

export default function RevenuePage() {
  // SCRUM-61: the owner works across every branch, a chi nhánh trưởng only their own. This screen is
  // per branch, so the picker opens on the branch the caller manages and grays out the others.
  const { profile, can } = useProfile();
  const { locale, t } = useLocale();
  const viewerId = profile?.id ?? null;
  const managesAllBranches = can("branch:manage");
  const viewer = { userId: viewerId, managesAllBranches };

  const [branches, setBranches] = useState<Branch[]>([]);
  const [requestedBranchId, setRequestedBranchId] = useState("");
  // The branch the screen shows: what the user picked, or — before any pick, and once the role is
  // known — the branch the caller manages (the owner gets the first one, SCRUM-61). Derived rather
  // than stored in an effect, so selecting a default never cascades a second render.
  const branchId = requestedBranchId || defaultBranchId(branches, viewer);
  const [records, setRecords] = useState<RevenueRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"open" | "close" | "">("");
  const [openAmount, setOpenAmount] = useState("0");
  const [closeAmount, setCloseAmount] = useState("0");
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [closeNote, setCloseNote] = useState("");
  const [difference, setDifference] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Branches first: the screen is per branch, and the revenue API needs one.
  useEffect(() => {
    let cancelled = false;

    fetch("/api/branches", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: Branch[]) => {
        if (cancelled) {
          return;
        }

        const list = asArray<Branch>(data);
        setBranches(list);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  // Which branches this caller may actually write: the owner all of them, a manager only their own.
  const manageableIds = new Set(
    branches
      .filter((branch) => canManageBranch(branch, viewer))
      .map((branch) => branch.id),
  );
  // A manager who heads no branch keeps a browsable picker (nothing is disabled) — the buttons below
  // and the API refuse the write either way.
  const grayOutForeign = manageableIds.size > 0;
  const selectedBranch = branches.find((branch) => branch.id === branchId);
  const canManageSelected = canManageBranch(selectedBranch, viewer);

  // The last week of declarations for the selected branch, newest first.
  useEffect(() => {
    if (!branchId) {
      return;
    }

    let cancelled = false;

    async function load(): Promise<{
      records: RevenueRecord[];
      error: string | null;
    }> {
      const response = await fetch(
        `/api/revenue?branch_id=${branchId}&days=7`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        return {
          records: [],
          error: errorMessageFor(response.status, data, t),
        };
      }

      return {
        records: asArray<RevenueRecord>(await response.json()),
        error: null,
      };
    }

    load()
      .then((result) => {
        if (cancelled) {
          return;
        }

        setRecords(result.records);
        setPageError(result.error ?? "");
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setRecords([]);
        setPageError(t("error.network"));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [branchId, reloadToken, t]);

  function refresh() {
    setLoading(true);
    setPageError("");
    setReloadToken((token) => token + 1);
  }

  const today = getBusinessDay(new Date());
  const recordsLoading = loading && branchId !== "";
  const todayRecord =
    records.find(
      (record) => getBusinessDay(new Date(record.created_at)) === today,
    ) ?? null;
  const countedTotal = DENOMINATIONS.reduce(
    (total, denomination) => total + denomination * (counts[denomination] ?? 0),
    0,
  );

  /**
   * The denomination counter is a calculator for the "tiền cuối ca" field: changing a count rewrites
   * the field, and typing in the field directly stays valid until the next count changes.
   */
  function setCount(denomination: number, rawValue: number) {
    const value = Number.isFinite(rawValue) && rawValue > 0 ? Math.floor(rawValue) : 0;
    const next = { ...counts, [denomination]: value };

    setCounts(next);
    setCloseAmount(
      String(
        DENOMINATIONS.reduce(
          (total, current) => total + current * (next[current] ?? 0),
          0,
        ),
      ),
    );
  }

  async function declareOpen() {
    const amount = Number(openAmount);

    if (busy || !branchId) {
      return;
    }

    if (!Number.isFinite(amount) || amount < 0) {
      setPageError(t("revenue.error.openNotNegative"));
      return;
    }

    setBusy("open");
    setPageError("");
    setNote("");
    setDifference(null);

    try {
      const response = await fetch("/api/revenue/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch_id: branchId, open_amount: amount }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setPageError(errorMessageFor(response.status, data, t));
        return;
      }

      setNote(
        t("revenue.noteOpened", { amount: formatCurrency(amount, locale) }),
      );
      refresh();
    } catch {
      setPageError(t("error.network"));
    } finally {
      setBusy("");
    }
  }

  async function declareClose() {
    const amount = Number(closeAmount);

    if (busy || !branchId) {
      return;
    }

    if (!Number.isFinite(amount) || amount < 0) {
      setPageError(t("revenue.error.closeNotNegative"));
      return;
    }

    setBusy("close");
    setPageError("");
    setNote("");
    setDifference(null);

    try {
      const response = await fetch("/api/revenue/close", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: branchId,
          close_amount: amount,
          close_note: closeNote.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setPageError(errorMessageFor(response.status, data, t));
        return;
      }

      const data = (await response.json()) as {
        revenue: RevenueRecord;
        revenue_difference: number;
      };

      setDifference(data.revenue_difference);
      setNote(t("revenue.noteClosed"));
      setCounts({});
      setCloseNote("");
      refresh();
    } catch {
      setPageError(t("error.network"));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200/80 bg-surface p-5 shadow-sm lg:flex-row lg:items-center">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {t("revenue.eyebrow")}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t("nav.revenue")}
          </h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
            {t("revenue.subtitle")}
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

      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
        <label className="text-xs font-semibold text-slate-600">
          {t("common.branch")}
          <select
            value={branchId}
            onChange={(event) => setRequestedBranchId(event.target.value)}
            className={`mt-1 ${inputClassName}`}
          >
            {branches.length === 0 && (
              <option value="">{t("revenue.noBranch")}</option>
            )}
            {branches.map((branch) => {
              const manageable = manageableIds.has(branch.id);

              return (
                <option
                  key={branch.id}
                  value={branch.id}
                  // SCRUM-61: a branch the caller does not head is grayed out — the server refuses the
                  // write anyway, so the picker should not pretend otherwise.
                  disabled={grayOutForeign && !manageable}
                >
                  {branch.name}
                  {manageable ? "" : t("common.readOnlySuffix")}
                </option>
              );
            })}
          </select>
        </label>
        {branchId && !canManageSelected && (
          <p className="text-[11px] font-semibold text-amber-600">
            {t("revenue.foreignBranch")}
          </p>
        )}
        <p className="text-[11px] text-slate-500">
          {t("revenue.todayLead")} <b className="text-slate-700">{today}</b>
        </p>
      </section>

      {pageError && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle size={16} />
          {pageError}
        </div>
      )}

      {note && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <Check size={16} />
          {note}
        </div>
      )}

      {difference !== null && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
            difference < 0
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          <CircleDollarSign size={16} />
          {t("revenue.differenceLead")}{" "}
          <b className="tabular-nums">{formatCurrency(difference, locale)}</b>{" "}
          {t("revenue.differenceNote")}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200/80 bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
              <Unlock size={18} />
            </span>
            <div>
              <h2 className="font-bold text-slate-900">{t("revenue.openTitle")}</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {t("revenue.openHint")}
              </p>
            </div>
          </div>

          {todayRecord ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-700">
                {t("revenue.openedAt", {
                  time: formatDateTime(todayRecord.created_at, locale),
                })}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                {formatCurrency(todayRecord.open_amount, locale)}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                {t("revenue.openOnce")}
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-semibold text-slate-600">
                {t("revenue.openAmountLabel")}
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={openAmount}
                  onChange={(event) => setOpenAmount(event.target.value)}
                  className={`mt-1 tabular-nums ${inputClassName}`}
                />
              </label>
              <button
                type="button"
                onClick={() => void declareOpen()}
                disabled={busy !== "" || !branchId || !canManageSelected}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "open" ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Unlock size={15} />
                )}
                {t("revenue.declareOpen")}
              </button>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200/80 bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <LockKeyhole size={18} />
            </span>
            <div>
              <h2 className="font-bold text-slate-900">{t("revenue.closeShift")}</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {t("revenue.closeHint")}
              </p>
            </div>
          </div>

          {!todayRecord ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t("revenue.openFirst")}
            </p>
          ) : todayRecord.closed_at ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-semibold text-emerald-800">
                {t("revenue.closedAt", {
                  time: formatDateTime(todayRecord.closed_at, locale),
                })}
              </p>
              <div className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-3 sm:gap-2">
                <span className="text-slate-600">
                  {t("revenue.openAmount")}
                  <b className="mt-0.5 block tabular-nums text-slate-900">
                    {formatCurrency(todayRecord.open_amount, locale)}
                  </b>
                </span>
                <span className="text-slate-600">
                  {t("revenue.closeAmount")}
                  <b className="mt-0.5 block tabular-nums text-slate-900">
                    {formatCurrency(todayRecord.close_amount ?? 0, locale)}
                  </b>
                </span>
                <span className="text-slate-600">
                  {t("revenue.revenue")}
                  <b className="mt-0.5 block tabular-nums text-primary">
                    {formatCurrency(
                      (todayRecord.close_amount ?? 0) - todayRecord.open_amount,
                      locale,
                    )}
                  </b>
                </span>
              </div>
              {todayRecord.close_note && (
                <p className="mt-2 text-[11px] text-slate-600">
                  {t("revenue.closeNoteInline", { note: todayRecord.close_note })}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-slate-200">
                <div className="grid grid-cols-2 gap-x-4 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <span>{t("revenue.denomination")}</span>
                  <span className="text-right">{t("revenue.denominationCount")}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {DENOMINATIONS.map((denomination) => (
                    <div
                      key={denomination}
                      className="grid grid-cols-2 items-center gap-x-4 px-3 py-1.5"
                    >
                      <span className="text-xs tabular-nums text-slate-600">
                        {formatCurrency(denomination, locale)}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={counts[denomination] ?? 0}
                        onChange={(event) =>
                          setCount(denomination, Number(event.target.value))
                        }
                        aria-label={t("revenue.denominationCountAria", {
                          amount: formatCurrency(denomination, locale),
                        })}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-right text-xs tabular-nums outline-none focus:border-primary"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs">
                  <span className="font-semibold text-slate-600">
                    {t("revenue.countedCash")}
                  </span>
                  <b className="tabular-nums text-slate-900">
                    {formatCurrency(countedTotal, locale)}
                  </b>
                </div>
              </div>

              <label className="block text-xs font-semibold text-slate-600">
                {t("revenue.closeAmountLabel")}
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={closeAmount}
                  onChange={(event) => setCloseAmount(event.target.value)}
                  className={`mt-1 tabular-nums ${inputClassName}`}
                />
              </label>

              <label className="block text-xs font-semibold text-slate-600">
                {t("revenue.closeNoteLabel")}
                <textarea
                  value={closeNote}
                  onChange={(event) => setCloseNote(event.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder={t("revenue.closeNotePlaceholder")}
                  className={`mt-1 resize-none ${inputClassName}`}
                />
              </label>

              <button
                type="button"
                onClick={() => void declareClose()}
                disabled={busy !== "" || !canManageSelected}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "close" ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <LockKeyhole size={15} />
                )}
                {t("revenue.closeShift")}
              </button>
            </div>
          )}
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">{t("revenue.recentTitle")}</h2>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {t("revenue.recentHint")}
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <Wallet size={12} />
            {t("revenue.recordCount", { count: records.length })}
          </span>
        </div>

        {recordsLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            {t("revenue.loading")}
          </div>
        ) : records.length === 0 ? (
          <p className="px-5 py-12 text-center text-xs text-slate-400">
            {t("revenue.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t("revenue.businessDay")}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t("revenue.openAmount")}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t("revenue.closeAmount")}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t("revenue.revenue")}</th>
                  <th className="px-4 py-3 font-semibold">{t("common.status")}</th>
                  <th className="px-4 py-3 font-semibold">{t("revenue.columnClosedAt")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((record) => {
                  const isClosed = Boolean(record.closed_at);
                  const revenue = isClosed
                    ? (record.close_amount ?? 0) - record.open_amount
                    : null;

                  return (
                    <tr key={record.id} className="hover:bg-blue-50/40">
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-800">
                        {getBusinessDay(new Date(record.created_at))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                        {formatCurrency(record.open_amount, locale)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                        {isClosed
                          ? formatCurrency(record.close_amount ?? 0, locale)
                          : "—"}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${
                          revenue !== null && revenue < 0
                            ? "text-rose-600"
                            : "text-primary"
                        }`}
                      >
                        {revenue === null ? "—" : formatCurrency(revenue, locale)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-[9px] font-semibold ${
                            isClosed
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {isClosed
                            ? t("revenue.statusClosed")
                            : t("revenue.statusOpen")}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                        {formatDateTime(record.closed_at, locale)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-slate-100 px-4 py-3 text-[10px] text-slate-500">
          {t("revenue.footerLead")} <b>{t("revenue.footerSettled")}</b>{" "}
          {t("revenue.footerTail")}
        </div>
      </section>
    </div>
  );
}