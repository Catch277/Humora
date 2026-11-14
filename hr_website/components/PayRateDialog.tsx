"use client";

import { Loader2, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { useState } from "react";

import { useLocale } from "@/components/LocaleProvider";
import type { PayProfile } from "@/lib/domain/entities/PayProfile";
import { formatCurrency, formatDate, formatNumber } from "@/lib/i18n/format";
import { errorMessageFor, type ServerErrorBody } from "@/lib/i18n/serverMessages";

/** Whose rates the dialog is about; the id is what a new row (and the audit trail) is filed under. */
export type PayRateTarget = { employeeId: string; fullName: string };

/** What the screen should refetch — and which notice it should raise — after a successful write. */
export type PayRateSavedEvent = "created" | "updated" | "deleted";

type RateForm = {
  hourlyRate: string;
  overtimeMultiplier: string;
  fixedAllowance: string;
  effectiveFrom: string;
  note: string;
};

type Failure = { status: number; body: ServerErrorBody };

/** Today in Asia/Bangkok as `YYYY-MM-DD`, the default `effectiveFrom` of a new rate. */
function businessToday(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * The form starts from a stored rate (edit) or from today's date (create), which is the one difference the
 * two modes have — a raise is a NEW row, so it must not pre-fill the previous row's effective day.
 */
function formOf(rate: PayProfile | null): RateForm {
  return {
    hourlyRate: rate ? String(rate.hourly_rate) : "",
    overtimeMultiplier: String(rate?.overtime_multiplier ?? 1.5),
    fixedAllowance: String(rate?.fixed_allowance ?? 0),
    effectiveFrom: rate ? rate.effective_from : businessToday(),
    note: rate?.note ?? "",
  };
}

async function failureOf(response: Response): Promise<Failure> {
  const body = (await response.json().catch(() => null)) as ServerErrorBody;

  return { status: response.status, body };
}

/**
 * Đơn giá giờ of one employee, as a dialog two screens share (SCRUM-92).
 *
 * `/payroll` opens it from the rates tab and `/staff` opens it from the employee's own row, so the form, the
 * validation and the three write calls live here once instead of twice. The dialog owns no data: it receives
 * the rows already loaded by the screen and reports back through `onSaved`, which is what keeps the list on
 * screen and the list in the database telling the same story (the screen refetches).
 *
 * Deleting stays behind a confirmation step rather than a `confirm()`: a rate is salary data, and the note
 * that step prints is the one thing a reader must see — a published payslip does not change.
 */
export default function PayRateDialog({
  target,
  profiles,
  onClose,
  onSaved,
}: {
  target: PayRateTarget;
  profiles: PayProfile[];
  onClose: () => void;
  onSaved: (event: PayRateSavedEvent) => void;
}) {
  const { t, locale } = useLocale();
  const [view, setView] = useState<"history" | "form">(
    profiles.length > 0 ? "history" : "form",
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RateForm>(() => formOf(null));
  const [pendingDelete, setPendingDelete] = useState<PayProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  function openCreate() {
    setEditingId(null);
    setForm(formOf(null));
    setFailure(null);
    setPendingDelete(null);
    setView("form");
  }

  function openEdit(rate: PayProfile) {
    setEditingId(rate.id);
    setForm(formOf(rate));
    setFailure(null);
    setPendingDelete(null);
    setView("form");
  }

  function backToHistory() {
    setEditingId(null);
    setFailure(null);
    setPendingDelete(null);
    setView("history");
  }

  async function submit() {
    // Captured now: `setEditingId(null)` below must not change which call was made or which notice the
    // screen raises.
    const editing = editingId;
    const hourlyRate = Number(form.hourlyRate);
    const multiplier = Number(form.overtimeMultiplier);
    const allowance = Number(form.fixedAllowance || "0");

    if (!Number.isInteger(hourlyRate) || hourlyRate < 0) {
      setFailure({ status: 400, body: { error: t("payroll.error.rateValue") } });
      return;
    }

    if (!form.effectiveFrom) {
      setFailure({ status: 400, body: { error: t("payroll.error.effectiveFrom") } });
      return;
    }

    const rate = {
      hourlyRate,
      effectiveFrom: form.effectiveFrom,
      overtimeMultiplier:
        Number.isFinite(multiplier) && multiplier >= 1 ? multiplier : 1.5,
      fixedAllowance: Number.isFinite(allowance) ? allowance : 0,
      note: form.note.trim() || null,
    };

    setBusy(true);
    setFailure(null);

    try {
      const response = editing
        ? await fetch(`/api/payroll/profiles/${editing}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(rate),
          })
        : await fetch("/api/payroll/profiles", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employeeId: target.employeeId, ...rate }),
          });

      if (!response.ok) {
        setFailure(await failureOf(response));
        return;
      }

      setView("history");
      setEditingId(null);
      onSaved(editing ? "updated" : "created");
    } catch {
      setFailure({ status: 500, body: null });
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove() {
    if (!pendingDelete) {
      return;
    }

    setBusy(true);
    setFailure(null);

    try {
      const response = await fetch(`/api/payroll/profiles/${pendingDelete.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setFailure(await failureOf(response));
        return;
      }

      setPendingDelete(null);
      setView("history");
      onSaved("deleted");
    } catch {
      setFailure({ status: 500, body: null });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("payroll.rates.historyTitle", { name: target.fullName })}
        className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-surface shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {pendingDelete
                ? t("payroll.rates.removeTitle")
                : view === "form"
                  ? editingId
                    ? t("payroll.rates.editTitle")
                    : t("payroll.rates.newTitle")
                  : t("payroll.rates.historyTitle", { name: target.fullName })}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {pendingDelete ? target.fullName : t("payroll.rates.historyHint")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("payroll.detail.close")}
            className="rounded-lg p-2 text-slate-500 hover:bg-surface-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          {failure && (
            <p className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {errorMessageFor(failure.status, failure.body, t)}
            </p>
          )}

          {pendingDelete ? (
            <div className="flex flex-col gap-3">
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {t("payroll.rates.removeNote")}
              </p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div>
                  <dt className="text-slate-500">{t("payroll.rates.hourly")}</dt>
                  <dd className="font-semibold text-slate-900">
                    {formatCurrency(pendingDelete.hourly_rate, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">
                    {t("payroll.rates.effectiveFrom")}
                  </dt>
                  <dd className="whitespace-nowrap font-semibold text-slate-900">
                    {formatDate(pendingDelete.effective_from, locale)}
                  </dd>
                </div>
              </dl>
            </div>
          ) : view === "form" ? (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                {t("payroll.rates.hourly")}
                <input
                  value={form.hourlyRate}
                  onChange={(event) =>
                    setForm({ ...form, hourlyRate: event.target.value })
                  }
                  inputMode="numeric"
                  className="rounded-lg border border-slate-200 bg-surface px-2 py-2 text-sm text-slate-800"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                {t("payroll.rates.multiplier")}
                <input
                  value={form.overtimeMultiplier}
                  onChange={(event) =>
                    setForm({ ...form, overtimeMultiplier: event.target.value })
                  }
                  inputMode="decimal"
                  className="rounded-lg border border-slate-200 bg-surface px-2 py-2 text-sm text-slate-800"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                {t("payroll.rates.allowance")}
                <input
                  value={form.fixedAllowance}
                  onChange={(event) =>
                    setForm({ ...form, fixedAllowance: event.target.value })
                  }
                  inputMode="numeric"
                  className="rounded-lg border border-slate-200 bg-surface px-2 py-2 text-sm text-slate-800"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                {t("payroll.rates.effectiveFrom")}
                <input
                  type="date"
                  value={form.effectiveFrom}
                  onChange={(event) =>
                    setForm({ ...form, effectiveFrom: event.target.value })
                  }
                  className="rounded-lg border border-slate-200 bg-surface px-2 py-2 text-sm text-slate-800"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                {t("payroll.rates.note")}
                <textarea
                  value={form.note}
                  onChange={(event) =>
                    setForm({ ...form, note: event.target.value })
                  }
                  rows={2}
                  maxLength={500}
                  className="rounded-lg border border-slate-200 bg-surface px-2 py-2 text-sm text-slate-800"
                />
              </label>
            </div>
          ) : profiles.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              {t("payroll.rates.historyEmpty")}
            </p>
          ) : (
            profiles.map((rate) => (
              <div
                key={rate.id}
                className="rounded-xl border border-slate-200/80 px-3 py-2"
              >
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div>
                    <dt className="text-slate-500">{t("payroll.rates.hourly")}</dt>
                    <dd className="font-semibold text-slate-900">
                      {formatCurrency(rate.hourly_rate, locale)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">
                      {t("payroll.rates.effectiveFrom")}
                    </dt>
                    <dd className="whitespace-nowrap font-semibold text-slate-900">
                      {formatDate(rate.effective_from, locale)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">
                      {t("payroll.rates.multiplier")}
                    </dt>
                    <dd className="text-slate-700">
                      ×{formatNumber(rate.overtime_multiplier, locale)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">
                      {t("payroll.rates.allowance")}
                    </dt>
                    <dd className="text-slate-700">
                      {formatCurrency(rate.fixed_allowance, locale)}
                    </dd>
                  </div>
                </dl>
                {rate.note && (
                  <p className="mt-2 text-xs text-slate-600">{rate.note}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(rate)}
                    disabled={busy}
                    className="min-h-10 whitespace-nowrap rounded-lg border border-slate-200/80 px-3 text-xs font-medium text-slate-600 hover:bg-surface-muted disabled:opacity-60"
                  >
                    {t("payroll.rates.rowEdit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFailure(null);
                      setPendingDelete(rate);
                    }}
                    disabled={busy}
                    className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-lg border border-rose-200 px-3 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("payroll.rates.remove")}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200/80 px-4 py-3">
          {pendingDelete ? (
            <>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={busy}
                className="inline-flex min-h-10 items-center rounded-lg border border-slate-200/80 px-3 text-sm font-medium text-slate-600 hover:bg-surface-muted disabled:opacity-60"
              >
                {t("payroll.rates.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void confirmRemove()}
                disabled={busy}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {t("payroll.rates.removeConfirm")}
              </button>
            </>
          ) : view === "form" ? (
            <>
              <button
                type="button"
                onClick={profiles.length > 0 ? backToHistory : onClose}
                disabled={busy}
                className="inline-flex min-h-10 items-center rounded-lg border border-slate-200/80 px-3 text-sm font-medium text-slate-600 hover:bg-surface-muted disabled:opacity-60"
              >
                {t("payroll.rates.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-strong disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("payroll.rates.save")}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-10 items-center rounded-lg border border-slate-200/80 px-3 text-sm font-medium text-slate-600 hover:bg-surface-muted"
              >
                {t("payroll.detail.close")}
              </button>
              <button
                type="button"
                onClick={openCreate}
                disabled={busy}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-strong disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                {t("payroll.rates.addNew")}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
