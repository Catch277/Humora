"use client";

import { useState } from "react";

import CrmModal, { CrmCancel, CrmSubmit } from "@/components/CrmModal";
import { useLocale } from "@/components/LocaleProvider";
import {
  LEAD_STATUSES,
  type CustomerLead,
  type LeadStatus,
} from "@/lib/domain/entities/CustomerLead";
import { leadStatusLabel } from "@/lib/i18n/labels";
import { errorMessageFor, type ServerErrorBody } from "@/lib/i18n/serverMessages";

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

/**
 * Ghi một yêu cầu demo / dùng thử (SCRUM-101, C3).
 *
 * The landing form sends its payload to an external endpoint (`landing_website/lib/lead.ts`), so the record
 * starts here either copied from that mail or taken by phone. It is deliberately a *lead*: no contract, no
 * fee, no customer row — the owner decides separately whether it becomes one.
 */
export default function LeadDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (lead: CustomerLead) => void;
}) {
  const { t } = useLocale();
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [planInterest, setPlanInterest] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<LeadStatus>("NEW");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function submit() {
    setBusy(true);
    setFailure(null);

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          contactName: contactName || null,
          contactEmail,
          contactPhone: contactPhone || null,
          employeeCount: employeeCount === "" ? null : Number(employeeCount),
          planInterest: planInterest || null,
          message: message || null,
          source: "LANDING",
          status,
          note: note || null,
        }),
      });

      if (!response.ok) {
        setFailure({
          status: response.status,
          body: (await response.json().catch(() => null)) as ServerErrorBody,
        });
        return;
      }

      onSaved((await response.json()) as CustomerLead);
    } catch {
      setFailure({ status: 0, body: { error: t("error.network") } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <CrmModal
      title={t("customers.form.newLead")}
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
            value={companyName}
            maxLength={160}
            onChange={(event) => setCompanyName(event.target.value)}
          />
        </Field>

        <Field label={t("customers.form.contactName")}>
          <input
            className={INPUT_CLASS}
            value={contactName}
            maxLength={120}
            onChange={(event) => setContactName(event.target.value)}
          />
        </Field>

        <Field label={t("customers.form.contactEmail")}>
          <input
            type="email"
            className={INPUT_CLASS}
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
          />
        </Field>

        <Field label={t("customers.form.contactPhone")}>
          <input
            className={INPUT_CLASS}
            value={contactPhone}
            maxLength={40}
            onChange={(event) => setContactPhone(event.target.value)}
          />
        </Field>

        <Field label={t("customers.form.headcount")}>
          <input
            type="number"
            min={1}
            className={INPUT_CLASS}
            value={employeeCount}
            onChange={(event) => setEmployeeCount(event.target.value)}
          />
        </Field>

        <Field label={t("customers.form.planInterest")}>
          <input
            className={INPUT_CLASS}
            value={planInterest}
            maxLength={40}
            onChange={(event) => setPlanInterest(event.target.value)}
          />
        </Field>

        <Field label={t("customers.form.leadStatus")}>
          <select
            className={INPUT_CLASS}
            value={status}
            onChange={(event) => setStatus(event.target.value as LeadStatus)}
          >
            {LEAD_STATUSES.map((value) => (
              <option key={value} value={value}>
                {leadStatusLabel(value, t)}
              </option>
            ))}
          </select>
        </Field>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={LABEL_CLASS}>{t("customers.form.message")}</span>
          <textarea
            className={`${INPUT_CLASS} min-h-24`}
            value={message}
            maxLength={2000}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={LABEL_CLASS}>{t("customers.form.notes")}</span>
          <textarea
            className={`${INPUT_CLASS} min-h-20`}
            value={note}
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

      </div>
    </CrmModal>
  );
}
