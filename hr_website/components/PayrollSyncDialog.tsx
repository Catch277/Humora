"use client";

import { Loader2, RefreshCw, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useLocale } from "@/components/LocaleProvider";
import {
  hasReconciliationFlag,
  needsPayrollSync,
  type PayrollReconciliation,
  type PayrollSyncResult,
} from "@/lib/domain/entities/PayrollReconciliation";
import { formatCurrency } from "@/lib/i18n/format";
import { errorMessageFor, type ServerErrorBody } from "@/lib/i18n/serverMessages";
import type { MessageKey } from "@/lib/i18n/translate";

type Failure = { status: number; message?: string };

/** The reasons `payroll_sync` answers; a code this build does not know renders verbatim. */
const REASON_KEYS: Record<string, MessageKey> = {
  MISSING_PAYSLIP: "payroll.sync.reason.MISSING_PAYSLIP",
  STALE: "payroll.sync.reason.STALE",
  IN_SYNC: "payroll.sync.reason.IN_SYNC",
  PUBLISHED: "payroll.sync.reason.PUBLISHED",
  NO_ATTENDANCE: "payroll.sync.reason.NO_ATTENDANCE",
};

async function failureOf(response: Response): Promise<Failure> {
  const body = (await response.json().catch(() => null)) as ServerErrorBody;

  return {
    status: response.status,
    message: typeof body?.error === "string" ? body.error : undefined,
  };
}

/**
 * Đồng bộ lương của một tháng (SCRUM-99) — **hai bước, và bước ghi không bao giờ là bước đầu tiên**.
 *
 * On open the dialog asks two read-only questions: the dry run (`POST /api/payroll/sync` without `apply`)
 * answers which rows the server would touch, and the reconciliation answers which of those carry a
 * `ADJUSTMENT` — the figure `set_payslip_net` owns, which a regenerate drops (SCRUM-93 by design). The reader
 * therefore sees how many payslips move, by how much, and the one consequence that needs a follow-up action
 * *before* pressing the button.
 *
 * The confirm button is only rendered when there is something to do: an empty plan is a sentence, not a
 * disabled control the reader has to interpret.
 */
export default function PayrollSyncDialog({
  month,
  monthLabel,
  nameOf,
  onClose,
  onApplied,
}: {
  month: string;
  monthLabel: string;
  /** The directory lookup the page already has, so a row reads as a name instead of an id. */
  nameOf: (employeeId: string) => string;
  onClose: () => void;
  onApplied: (changed: number) => void;
}) {
  const { t, locale } = useLocale();
  const [plan, setPlan] = useState<PayrollSyncResult | null>(null);
  const [reconciliation, setReconciliation] =
    useState<PayrollReconciliation | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const ask = (path: string, init?: RequestInit): Promise<Response | null> =>
      fetch(path, init).catch(() => null);

    Promise.all([
      ask("/api/payroll/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      }),
      ask(`/api/payroll/reconciliation?month=${month}`),
    ]).then(async ([planResponse, reconciliationResponse]) => {
      if (cancelled) {
        return;
      }

      // The dry run is the point of the dialog: without it there is nothing honest to confirm.
      if (!planResponse?.ok) {
        setFailure(
          planResponse ? await failureOf(planResponse) : { status: 500 },
        );
        return;
      }

      const nextPlan = (await planResponse.json()) as PayrollSyncResult;
      // The reconciliation only feeds the amber warning, so its failure must not block the sync itself.
      const nextReconciliation = reconciliationResponse?.ok
        ? ((await reconciliationResponse.json()) as PayrollReconciliation)
        : null;

      if (cancelled) {
        return;
      }

      setPlan(nextPlan);
      setReconciliation(nextReconciliation);
    });

    return () => {
      cancelled = true;
    };
  }, [month]);

  const changed = (plan?.rows ?? []).filter((row) => row.action !== "SKIP");
  const adjustments = (reconciliation?.rows ?? []).filter(
    (row) => needsPayrollSync(row) && hasReconciliationFlag(row, "ADJUSTMENT"),
  ).length;

  async function apply() {
    setBusy(true);
    setFailure(null);

    try {
      const response = await fetch("/api/payroll/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, apply: true }),
      });

      if (!response.ok) {
        setFailure(await failureOf(response));
        return;
      }

      const result = (await response.json()) as PayrollSyncResult;

      onApplied(result.changed);
      onClose();
    } catch {
      setFailure({ status: 500 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("payroll.sync.title", { month: monthLabel })}
        className="flex max-h-[85dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-surface shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {t("payroll.sync.title", { month: monthLabel })}
            </h2>
            <p className="mt-1 text-xs text-slate-500">{t("payroll.sync.hint")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("payroll.detail.close")}
            className="min-h-10 min-w-10 rounded-lg text-slate-500 hover:bg-surface-muted hover:text-slate-900"
          >
            <X className="mx-auto h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {failure && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {errorMessageFor(failure.status, { error: failure.message }, t)}
              </span>
            </div>
          )}

          {!plan && !failure && (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("payroll.sync.loading")}
            </div>
          )}

          {plan && changed.length === 0 && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {t("payroll.sync.nothing")}
            </p>
          )}

          {plan && changed.length > 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-slate-900">
                {t("payroll.sync.summary", {
                  count: changed.length,
                  amount: formatCurrency(plan.delta_total, locale),
                })}
              </p>

              {adjustments > 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {t("payroll.sync.adjustmentWarning", { count: adjustments })}
                  </span>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="min-w-full text-xs">
                  <thead className="bg-surface-muted text-left uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-2 font-medium">
                        {t("payroll.sync.column.employee")}
                      </th>
                      <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                        {t("payroll.sync.column.before")}
                      </th>
                      <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                        {t("payroll.sync.column.after")}
                      </th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium">
                        {t("payroll.sync.column.reason")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {changed.map((row) => (
                      <tr key={row.employee_id}>
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {nameOf(row.employee_id)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">
                          {formatCurrency(row.before_net, locale)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-slate-900">
                          {formatCurrency(row.after_net, locale)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                          {REASON_KEYS[row.reason]
                            ? t(REASON_KEYS[row.reason])
                            : row.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/80 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-lg border border-slate-200/80 px-3 text-sm font-medium text-slate-600 hover:bg-surface-muted"
          >
            {t("payroll.sync.cancel")}
          </button>
          {plan && changed.length > 0 && (
            <button
              type="button"
              onClick={apply}
              disabled={busy}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-strong disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {t("payroll.sync.confirm")}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
