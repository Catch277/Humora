"use client";

import { Loader2, Save, Trash2, TriangleAlert, X } from "lucide-react";
import { useState } from "react";

import { useLocale } from "@/components/LocaleProvider";
import {
  DEMO_PAY_SALARY_STATUSES,
  type DemoPaySalary,
} from "@/lib/domain/entities/DemoPaySalary";
import {
  DEFAULT_DEMO_SALARY_POSITION,
  DEMO_SALARY_POSITIONS,
  demoSalaryPositionLabel,
} from "@/lib/domain/demoSalaryPositions";
import { errorMessageFor, type ServerErrorBody } from "@/lib/i18n/serverMessages";
import type { MessageKey } from "@/lib/i18n/translate";

export type DemoSalarySavedEvent = "created" | "updated" | "archived" | "removed";

type Failure = { status: number; body: ServerErrorBody };

type DemoForm = {
  positionCode: string;
  monthlyHours: string;
  hourlyRate: string;
  allowanceAmount: string;
  bonusAmount: string;
  deductionAmount: string;
  effectiveFrom: string;
  note: string;
  status: string;
};

const STATUS_KEYS: Record<string, MessageKey> = {
  ACTIVE: "payroll.demo.status.ACTIVE",
  ARCHIVED: "payroll.demo.status.ARCHIVED",
};

/** Today in Asia/Bangkok as `YYYY-MM-DD`, the default `effectiveFrom` of a new sample salary. */
function businessToday(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * A new row starts on the **director** position, 208 hours a month (26 ca × 8 h) and an empty rate: the ticket
 * is about the one position with no path into the real payroll, so the form must not make the reader pick it
 * every time.
 */
function formOf(row: DemoPaySalary | null): DemoForm {
  return {
    positionCode: row?.position_code ?? DEFAULT_DEMO_SALARY_POSITION,
    monthlyHours: row ? String(row.monthly_hours) : "208",
    hourlyRate: row ? String(row.hourly_rate) : "",
    allowanceAmount: String(row?.allowance_amount ?? 0),
    bonusAmount: String(row?.bonus_amount ?? 0),
    deductionAmount: String(row?.deduction_amount ?? 0),
    effectiveFrom: row?.effective_from ?? businessToday(),
    note: row?.note ?? "",
    status: row?.status ?? "ACTIVE",
  };
}

async function failureOf(response: Response): Promise<Failure> {
  const body = (await response.json().catch(() => null)) as ServerErrorBody;

  return { status: response.status, body };
}

function readInteger(value: string): number | null {
  const parsed = Number(value || "0");

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Lương thử việc của một vị trí (SCRUM-100) — thêm, sửa, ngừng theo dõi và xoá trong một hộp thoại.
 *
 * The dialog owns the form and the four calls, and nothing else: the list belongs to `/payroll`, which refetches
 * after `onSaved`. Two deliberate choices:
 *
 * - **No gross/net preview.** That arithmetic lives in SQL (`demo_pay_gross` + the table's CHECK); showing a
 *   locally multiplied figure would be a second implementation that can disagree with the stored row.
 * - **Deleting stays behind a confirmation step**, and its note says what a reader needs to know: this row is a
 *   simulation, so nothing real changes — and the removal is still recorded in the payroll audit log.
 */
export default function DemoSalaryDialog({
  target,
  onClose,
  onSaved,
}: {
  /** `null` opens the form on a new row; a row opens it in edit mode. */
  target: DemoPaySalary | null;
  onClose: () => void;
  onSaved: (event: DemoSalarySavedEvent) => void;
}) {
  const { t } = useLocale();
  const [form, setForm] = useState<DemoForm>(() => formOf(target));
  const [pendingDelete, setPendingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  function update<K extends keyof DemoForm>(key: K, value: DemoForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectPosition(code: string) {
    // The stored title is derived from the code at submit time, so two rows of the same position cannot read
    // differently and a typo in a free-text title cannot invent a position.
    setForm((current) => ({
      ...current,
      positionCode: code,
    }));
  }

  async function submit() {
    const monthlyHours = Number(form.monthlyHours);
    const hourlyRate = readInteger(form.hourlyRate);
    const allowance = readInteger(form.allowanceAmount);
    const bonus = readInteger(form.bonusAmount);
    const deduction = readInteger(form.deductionAmount);

    if (!Number.isFinite(monthlyHours) || monthlyHours <= 0) {
      setFailure({ status: 400, body: { error: t("payroll.demo.error.hours") } });
      return;
    }

    if (hourlyRate === null) {
      setFailure({ status: 400, body: { error: t("payroll.demo.error.rate") } });
      return;
    }

    if (allowance === null || bonus === null || deduction === null) {
      setFailure({ status: 400, body: { error: t("payroll.demo.error.amount") } });
      return;
    }

    if (!form.effectiveFrom) {
      setFailure({
        status: 400,
        body: { error: t("payroll.demo.error.effectiveFrom") },
      });
      return;
    }

    setBusy(true);
    setFailure(null);

    const payload = {
      positionCode: form.positionCode,
      positionTitle: demoSalaryPositionLabel(form.positionCode, t),
      monthlyHours,
      hourlyRate,
      allowanceAmount: allowance,
      bonusAmount: bonus,
      deductionAmount: deduction,
      effectiveFrom: form.effectiveFrom,
      note: form.note.trim() || null,
      status: form.status,
    };

    try {
      const response = target
        ? await fetch(`/api/payroll/demo-salaries/${target.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/payroll/demo-salaries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (!response.ok) {
        setFailure(await failureOf(response));
        return;
      }

      onSaved(target ? "updated" : "created");
      onClose();
    } catch {
      setFailure({ status: 500, body: null });
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!target) {
      return;
    }

    setBusy(true);
    setFailure(null);

    try {
      const response = await fetch(
        `/api/payroll/demo-salaries/${target.id}/archive`,
        { method: "POST" },
      );

      if (!response.ok) {
        setFailure(await failureOf(response));
        return;
      }

      onSaved("archived");
      onClose();
    } catch {
      setFailure({ status: 500, body: null });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!target) {
      return;
    }

    setBusy(true);
    setFailure(null);

    try {
      const response = await fetch(`/api/payroll/demo-salaries/${target.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setFailure(await failureOf(response));
        return;
      }

      onSaved("removed");
      onClose();
    } catch {
      setFailure({ status: 500, body: null });
    } finally {
      setBusy(false);
    }
  }

  const title = target
    ? t("payroll.demo.form.editTitle")
    : t("payroll.demo.form.newTitle");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-surface shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {t("payroll.demo.form.hint")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("payroll.demo.form.cancel")}
            className="min-h-10 min-w-10 rounded-lg text-slate-500 hover:bg-surface-muted hover:text-slate-900"
          >
            <X className="mx-auto h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {failure && (
            <div
              role="alert"
              className="mb-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMessageFor(failure.status, failure.body, t)}</span>
            </div>
          )}

          {pendingDelete ? (
            <div className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800">
              <p className="font-semibold">{t("payroll.demo.removeTitle")}</p>
              <p className="text-xs">{t("payroll.demo.removeNote")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
                {t("payroll.demo.form.position")}
                <select
                  value={form.positionCode}
                  onChange={(event) => selectPosition(event.target.value)}
                  className="min-h-10 rounded-lg border border-slate-200 bg-surface px-2 text-sm text-slate-800"
                >
                  {DEMO_SALARY_POSITIONS.map((position) => (
                    <option key={position.code} value={position.code}>
                      {demoSalaryPositionLabel(position.code, t)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                {t("payroll.demo.form.hours")}
                <input
                  value={form.monthlyHours}
                  onChange={(event) => update("monthlyHours", event.target.value)}
                  inputMode="decimal"
                  className="min-h-10 rounded-lg border border-slate-200 bg-surface px-2 text-sm text-slate-800"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                {t("payroll.demo.form.hourly")}
                <input
                  value={form.hourlyRate}
                  onChange={(event) => update("hourlyRate", event.target.value)}
                  inputMode="numeric"
                  className="min-h-10 rounded-lg border border-slate-200 bg-surface px-2 text-sm text-slate-800"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                {t("payroll.demo.form.allowance")}
                <input
                  value={form.allowanceAmount}
                  onChange={(event) => update("allowanceAmount", event.target.value)}
                  inputMode="numeric"
                  className="min-h-10 rounded-lg border border-slate-200 bg-surface px-2 text-sm text-slate-800"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                {t("payroll.demo.form.bonus")}
                <input
                  value={form.bonusAmount}
                  onChange={(event) => update("bonusAmount", event.target.value)}
                  inputMode="numeric"
                  className="min-h-10 rounded-lg border border-slate-200 bg-surface px-2 text-sm text-slate-800"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                {t("payroll.demo.form.deduction")}
                <input
                  value={form.deductionAmount}
                  onChange={(event) => update("deductionAmount", event.target.value)}
                  inputMode="numeric"
                  className="min-h-10 rounded-lg border border-slate-200 bg-surface px-2 text-sm text-slate-800"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                {t("payroll.demo.form.effectiveFrom")}
                <input
                  type="date"
                  value={form.effectiveFrom}
                  onChange={(event) => update("effectiveFrom", event.target.value)}
                  className="min-h-10 rounded-lg border border-slate-200 bg-surface px-2 text-sm text-slate-800"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                {t("payroll.demo.form.status")}
                <select
                  value={form.status}
                  onChange={(event) => update("status", event.target.value)}
                  className="min-h-10 rounded-lg border border-slate-200 bg-surface px-2 text-sm text-slate-800"
                >
                  {DEMO_PAY_SALARY_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_KEYS[status] ? t(STATUS_KEYS[status]) : status}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
                {t("payroll.demo.form.note")}
                <textarea
                  value={form.note}
                  onChange={(event) => update("note", event.target.value)}
                  rows={2}
                  maxLength={500}
                  className="rounded-lg border border-slate-200 bg-surface px-2 py-2 text-sm text-slate-800"
                />
              </label>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/80 px-4 py-3">
          {pendingDelete ? (
            <>
              <button
                type="button"
                onClick={() => setPendingDelete(false)}
                className="min-h-10 rounded-lg border border-slate-200/80 px-3 text-sm font-medium text-slate-600 hover:bg-surface-muted"
              >
                {t("payroll.demo.cancel")}
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {t("payroll.demo.removeConfirm")}
              </button>
            </>
          ) : (
            <>
              {target && (
                <button
                  type="button"
                  onClick={() => setPendingDelete(true)}
                  disabled={busy}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-200 px-3 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  {t("payroll.demo.rowDelete")}
                </button>
              )}
              {target && target.status === "ACTIVE" && (
                <button
                  type="button"
                  onClick={archive}
                  disabled={busy}
                  className="min-h-10 rounded-lg border border-slate-200/80 px-3 text-sm font-medium text-slate-600 hover:bg-surface-muted disabled:opacity-60"
                >
                  {t("payroll.demo.rowArchive")}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="min-h-10 rounded-lg border border-slate-200/80 px-3 text-sm font-medium text-slate-600 hover:bg-surface-muted"
              >
                {t("payroll.demo.form.cancel")}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-strong disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t("payroll.demo.form.submit")}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
