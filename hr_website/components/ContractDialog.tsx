"use client";

import { useState } from "react";

import CrmModal, { CrmCancel, CrmSubmit } from "@/components/CrmModal";
import { useLocale } from "@/components/LocaleProvider";
import {
  BILLING_CYCLES,
  CONTRACT_PLANS,
  type BillingCycle,
  type ContractIntent,
  type ContractOverview,
  type ContractPlan,
} from "@/lib/domain/entities/CustomerContract";
import type { CustomerOverview } from "@/lib/domain/entities/Customer";
import {
  contractPlanLabel,
  billingCycleLabel,
} from "@/lib/i18n/labels";
import { formatCurrency } from "@/lib/i18n/format";
import { errorMessageFor, type ServerErrorBody } from "@/lib/i18n/serverMessages";
import {
  CONTRACT_MIN_FEE,
  estimateMonthlyFee,
  suggestUnitPrice,
} from "@/lib/domain/contractPlans";

export type ContractDialogMode = "create" | "edit" | "renew";
export type ContractSavedEvent = "created" | "updated" | "renewed";

type Failure = { status: number; body: ServerErrorBody };

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-200 bg-surface px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-blue-500/15";
const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-wider text-slate-500";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={LABEL_CLASS}>{label}</span>
      {children}
    </label>
  );
}

/** Today as a `YYYY-MM-DD` business date in Asia/Bangkok. */
function businessToday(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));

  return shifted.toISOString().slice(0, 10);
}

function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + months, day));

  return shifted.toISOString().slice(0, 10);
}

/** The length of the old term, so a renewal defaults to the same number of months. */
function termMonths(start: string, end: string): number {
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  const months = (endYear - startYear) * 12 + (endMonth - startMonth);

  return months > 0 ? months : 12;
}

type Form = {
  customerId: string;
  contractNo: string;
  planCode: ContractPlan;
  employeeCount: string;
  unitPrice: string;
  billingCycle: BillingCycle;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  reminderDays: string;
  status: ContractIntent;
  note: string;
};

function formOf(
  mode: ContractDialogMode,
  contract: ContractOverview | null,
  customers: CustomerOverview[],
  initialCustomerId: string | undefined,
): Form {
  if (contract && mode === "edit") {
    return {
      customerId: contract.customer_id,
      contractNo: contract.contract_no,
      planCode: contract.plan_code,
      employeeCount: String(contract.employee_count),
      unitPrice: String(contract.unit_price),
      billingCycle: contract.billing_cycle,
      startDate: contract.start_date,
      endDate: contract.end_date,
      autoRenew: contract.auto_renew,
      reminderDays: String(contract.reminder_days),
      status: contract.status,
      note: contract.note ?? "",
    };
  }

  if (contract && mode === "renew") {
    // A renewal starts the day after the old term ends and keeps the same length, plan, price and headcount.
    const startDate = addDays(contract.end_date, 1);

    return {
      customerId: contract.customer_id,
      contractNo: "",
      planCode: contract.plan_code,
      employeeCount: String(contract.employee_count),
      unitPrice: String(contract.unit_price),
      billingCycle: contract.billing_cycle,
      startDate,
      endDate: addMonths(startDate, termMonths(contract.start_date, contract.end_date)),
      autoRenew: contract.auto_renew,
      reminderDays: String(contract.reminder_days),
      status: "ACTIVE",
      note: "",
    };
  }

  const customerId = initialCustomerId ?? customers[0]?.id ?? "";
  const startDate = businessToday();

  return {
    customerId,
    contractNo: "",
    planCode: "ADVANCED",
    employeeCount: "10",
    unitPrice: String(suggestUnitPrice(10, "ADVANCED") ?? CONTRACT_MIN_FEE),
    billingCycle: "MONTHLY",
    startDate,
    endDate: addMonths(startDate, 12),
    autoRenew: true,
    reminderDays: "30",
    status: "ACTIVE",
    note: "",
  };
}

/**
 * Biểu mẫu hợp đồng (SCRUM-101, C4) — tạo, sửa và gia hạn.
 *
 * `monthlyFee` is never an input: the database derives it (`price × headcount`, floored at the quotation
 * minimum), and this form only shows a preview so the reader sees the consequence before saving. The plan
 * table from the landing site is a **hint**: "Dùng giá bậc" fills the price, but the stored number is
 * whatever the owner decides and whatever SQL stores.
 */
export default function ContractDialog({
  mode,
  contract,
  customers,
  initialCustomerId,
  onClose,
  onSaved,
}: {
  mode: ContractDialogMode;
  /** The row being edited or renewed; `null` for a new contract. */
  contract: ContractOverview | null;
  customers: CustomerOverview[];
  initialCustomerId?: string;
  onClose: () => void;
  onSaved: (event: ContractSavedEvent) => void;
}) {
  const { t, locale } = useLocale();
  const [form, setForm] = useState<Form>(() =>
    formOf(mode, contract, customers, initialCustomerId),
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  function update(patch: Partial<Form>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  const headcount = Number(form.employeeCount);
  const suggestion =
    Number.isFinite(headcount) && headcount > 0
      ? suggestUnitPrice(headcount, form.planCode)
      : null;
  const preview =
    mode === "edit" && contract
      ? contract.monthly_fee
      : Number.isFinite(headcount) && headcount > 0
        ? estimateMonthlyFee(headcount, form.planCode)
        : null;

  async function submit() {
    const target =
      mode === "create" ? "/api/contracts" : `/api/contracts/${contract?.id}`;
    const url = mode === "renew" ? `${target}/renew` : target;

    const term = {
      contractNo: form.contractNo,
      planCode: form.planCode,
      employeeCount: Number(form.employeeCount),
      unitPrice: Number(form.unitPrice),
      billingCycle: form.billingCycle,
      startDate: form.startDate,
      endDate: form.endDate,
      autoRenew: form.autoRenew,
      reminderDays: Number(form.reminderDays),
      note: form.note || null,
    };

    setBusy(true);
    setFailure(null);

    try {
      const response = await fetch(url, {
        method: mode === "edit" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "renew"
            ? term
            : {
                customerId: form.customerId,
                ...term,
                status: form.status === "TERMINATED" ? "ACTIVE" : form.status,
              },
        ),
      });

      if (!response.ok) {
        setFailure({
          status: response.status,
          body: (await response.json().catch(() => null)) as ServerErrorBody,
        });
        return;
      }

      onSaved(
        mode === "create" ? "created" : mode === "edit" ? "updated" : "renewed",
      );
    } catch {
      setFailure({ status: 0, body: { error: t("error.network") } });
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "renew"
      ? t("customers.renew.title", { no: contract?.contract_no ?? "" })
      : t(
          mode === "edit"
            ? "customers.form.editContract"
            : "customers.form.newContract",
        );

  return (
    <CrmModal
      title={title}
      description={mode === "renew" ? t("customers.renew.hint") : undefined}
      error={failure ? errorMessageFor(failure.status, failure.body, t) : ""}
      busy={busy}
      wide
      onClose={onClose}
      footer={
        <>
          <CrmCancel label={t("common.cancel")} onClick={onClose} disabled={busy} />
          <CrmSubmit label={t("common.save")} busy={busy} onClick={submit} />
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("customers.form.customer")}>
          <select
            className={INPUT_CLASS}
            value={form.customerId}
            disabled={mode !== "create"}
            onChange={(event) => update({ customerId: event.target.value })}
          >
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.company_name} — {customer.app_name}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("customers.form.contractNo")}>
          <input
            className={INPUT_CLASS}
            value={form.contractNo}
            maxLength={60}
            onChange={(event) => update({ contractNo: event.target.value })}
          />
        </Field>

        <Field label={t("customers.form.plan")}>
          <select
            className={INPUT_CLASS}
            value={form.planCode}
            onChange={(event) =>
              update({ planCode: event.target.value as ContractPlan })
            }
          >
            {CONTRACT_PLANS.map((plan) => (
              <option key={plan} value={plan}>
                {contractPlanLabel(plan, t)}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("customers.form.headcount")}>
          <input
            type="number"
            min={1}
            className={INPUT_CLASS}
            value={form.employeeCount}
            onChange={(event) => update({ employeeCount: event.target.value })}
          />
        </Field>

        <Field label={t("customers.form.unitPrice")}>
          <input
            type="number"
            min={0}
            className={INPUT_CLASS}
            value={form.unitPrice}
            onChange={(event) => update({ unitPrice: event.target.value })}
          />
        </Field>

        <div className="flex flex-col justify-end gap-1">
          {suggestion === null ? (
            <p className="text-[11px] leading-relaxed text-slate-500">
              {t("customers.form.noTier")}
            </p>
          ) : (
            <>
              <p className="text-[11px] text-slate-500">
                {t("customers.form.priceSuggestion", {
                  tier: contractPlanLabel(form.planCode, t),
                  price: formatCurrency(suggestion, locale),
                })}
              </p>
              <button
                type="button"
                onClick={() => update({ unitPrice: String(suggestion) })}
                className="self-start rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-semibold text-primary transition-colors hover:bg-blue-100"
              >
                {t("customers.form.useSuggested")}
              </button>
            </>
          )}
        </div>

        <Field label={t("customers.form.billingCycle")}>
          <select
            className={INPUT_CLASS}
            value={form.billingCycle}
            onChange={(event) =>
              update({ billingCycle: event.target.value as BillingCycle })
            }
          >
            {BILLING_CYCLES.map((cycle) => (
              <option key={cycle} value={cycle}>
                {billingCycleLabel(cycle, t)}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("customers.form.startDate")}>
          <input
            type="date"
            className={INPUT_CLASS}
            value={form.startDate}
            onChange={(event) => {
              const startDate = event.target.value;

              // Keep the term when only the start moves: the reader is correcting a day, not re-typing a year.
              update({
                startDate,
                endDate:
                  form.endDate < startDate
                    ? addMonths(startDate, 12)
                    : form.endDate,
              });
            }}
          />
        </Field>

        <Field label={t("customers.form.endDate")}>
          <input
            type="date"
            className={INPUT_CLASS}
            value={form.endDate}
            onChange={(event) => update({ endDate: event.target.value })}
          />
        </Field>

        <Field label={t("customers.form.reminderDays")}>
          <input
            type="number"
            min={0}
            max={365}
            className={INPUT_CLASS}
            value={form.reminderDays}
            onChange={(event) => update({ reminderDays: event.target.value })}
          />
        </Field>

        <Field label={t("customers.form.contractStatus")}>
          <select
            className={INPUT_CLASS}
            value={form.status}
            disabled={mode === "renew"}
            onChange={(event) =>
              update({ status: event.target.value as ContractIntent })
            }
          >
            <option value="DRAFT">{t("contractStatus.DRAFT")}</option>
            <option value="ACTIVE">{t("contractStatus.ACTIVE")}</option>
          </select>
        </Field>

        <label className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            checked={form.autoRenew}
            onChange={(event) => update({ autoRenew: event.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-blue-500/30"
          />
          <span className="text-xs text-slate-600">
            {t("customers.form.autoRenew")}
          </span>
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={LABEL_CLASS}>{t("customers.form.notes")}</span>
          <textarea
            className={`${INPUT_CLASS} min-h-20`}
            value={form.note}
            maxLength={1000}
            onChange={(event) => update({ note: event.target.value })}
          />
        </label>

        {preview !== null && (
          <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium text-primary sm:col-span-2">
            {t("customers.form.monthlyFeePreview", {
              amount: formatCurrency(preview, locale),
            })}
          </p>
        )}

      </div>
    </CrmModal>
  );
}

