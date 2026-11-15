"use client";

import { useState } from "react";

import CrmModal, { CrmCancel, CrmSubmit } from "@/components/CrmModal";
import { useLocale } from "@/components/LocaleProvider";
import {
  CUSTOMER_STATUSES,
  type CustomerOverview,
  type CustomerStatus,
} from "@/lib/domain/entities/Customer";
import { customerStatusLabel } from "@/lib/i18n/labels";
import { errorMessageFor, type ServerErrorBody } from "@/lib/i18n/serverMessages";
import type { Translate } from "@/lib/i18n/translate";

export type CustomerSavedEvent = "created" | "updated";

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

type Form = {
  companyName: string;
  appName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  taxCode: string;
  status: CustomerStatus;
  notes: string;
};

function formOf(customer: CustomerOverview | null): Form {
  return {
    companyName: customer?.company_name ?? "",
    appName: customer?.app_name ?? "",
    contactName: customer?.contact_name ?? "",
    contactEmail: customer?.contact_email ?? "",
    contactPhone: customer?.contact_phone ?? "",
    address: customer?.address ?? "",
    taxCode: customer?.tax_code ?? "",
    status: customer?.status ?? "PROSPECT",
    notes: customer?.notes ?? "",
  };
}

/**
 * Hồ sơ khách hàng (SCRUM-101, C4): công ty, tên App đăng ký, người liên hệ và trạng thái.
 *
 * The dialog owns the form and the two write calls; the screen refetches on `onSaved`, so the list, the KPI
 * strip and this form cannot tell different stories. A duplicate company or contact address answers `409`
 * and its sentence is shown here — not in a page banner that sits above the fold.
 */
export default function CustomerDialog({
  customer,
  onClose,
  onSaved,
}: {
  /** `null` creates; a row edits it. */
  customer: CustomerOverview | null;
  onClose: () => void;
  onSaved: (event: CustomerSavedEvent) => void;
}) {
  const { t } = useLocale();
  const [form, setForm] = useState<Form>(() => formOf(customer));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  function update(patch: Partial<Form>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function submit() {
    setBusy(true);
    setFailure(null);

    try {
      const response = await fetch(
        customer ? `/api/customers/${customer.id}` : "/api/customers",
        {
          method: customer ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyName: form.companyName,
            appName: form.appName,
            contactName: form.contactName || null,
            contactEmail: form.contactEmail,
            contactPhone: form.contactPhone || null,
            address: form.address || null,
            taxCode: form.taxCode || null,
            status: form.status,
            notes: form.notes || null,
          }),
        },
      );

      if (!response.ok) {
        setFailure({
          status: response.status,
          body: (await response.json().catch(() => null)) as ServerErrorBody,
        });
        return;
      }

      onSaved(customer ? "updated" : "created");
    } catch {
      setFailure({ status: 0, body: { error: t("error.network") } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <CrmModal
      title={t(
        customer ? "customers.form.editCustomer" : "customers.form.newCustomer",
      )}
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
        <Field label={t("customers.form.company")}>
          <input
            className={INPUT_CLASS}
            value={form.companyName}
            maxLength={160}
            onChange={(event) => update({ companyName: event.target.value })}
          />
        </Field>

        <Field label={t("customers.form.appName")}>
          <input
            className={INPUT_CLASS}
            value={form.appName}
            maxLength={80}
            onChange={(event) => update({ appName: event.target.value })}
          />
        </Field>

        <Field label={t("customers.form.contactName")}>
          <input
            className={INPUT_CLASS}
            value={form.contactName}
            maxLength={120}
            onChange={(event) => update({ contactName: event.target.value })}
          />
        </Field>

        <Field label={t("customers.form.contactEmail")}>
          <input
            type="email"
            className={INPUT_CLASS}
            value={form.contactEmail}
            onChange={(event) => update({ contactEmail: event.target.value })}
          />
        </Field>

        <Field label={t("customers.form.contactPhone")}>
          <input
            className={INPUT_CLASS}
            value={form.contactPhone}
            maxLength={40}
            onChange={(event) => update({ contactPhone: event.target.value })}
          />
        </Field>

        <Field label={t("customers.form.taxCode")}>
          <input
            className={INPUT_CLASS}
            value={form.taxCode}
            maxLength={40}
            onChange={(event) => update({ taxCode: event.target.value })}
          />
        </Field>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={LABEL_CLASS}>{t("customers.form.address")}</span>
          <input
            className={INPUT_CLASS}
            value={form.address}
            maxLength={300}
            onChange={(event) => update({ address: event.target.value })}
          />
        </label>

        <Field label={t("customers.form.status")}>
          <select
            className={INPUT_CLASS}
            value={form.status}
            onChange={(event) =>
              update({ status: event.target.value as CustomerStatus })
            }
          >
            {customerStatusOptions(t).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={LABEL_CLASS}>{t("customers.form.notes")}</span>
          <textarea
            className={`${INPUT_CLASS} min-h-20`}
            value={form.notes}
            maxLength={1000}
            onChange={(event) => update({ notes: event.target.value })}
          />
        </label>

      </div>
    </CrmModal>
  );
}

/** The status vocabulary of the select; one copy, keyed by the stored code. */
function customerStatusOptions(
  t: Translate,
): { value: CustomerStatus; label: string }[] {
  return CUSTOMER_STATUSES.map((status) => ({
    value: status,
    label: customerStatusLabel(status, t),
  }));
}
