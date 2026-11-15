"use client";

import { useState } from "react";

import CrmModal, { CrmCancel, CrmSubmit } from "@/components/CrmModal";
import { useLocale } from "@/components/LocaleProvider";
import type { ContractOverview } from "@/lib/domain/entities/CustomerContract";
import type { CustomerOverview } from "@/lib/domain/entities/Customer";
import {
  EMAIL_DIRECTIONS,
  type CustomerEmail,
  type EmailDirection,
} from "@/lib/domain/entities/CustomerEmail";
import { emailDirectionLabel } from "@/lib/i18n/labels";
import { errorMessageFor, type ServerErrorBody } from "@/lib/i18n/serverMessages";
import { isGmailThreadUrl } from "@/lib/usecases/gmailLinks";

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

/** "now" as the wall-clock value a `datetime-local` input reads, in Asia/Bangkok. */
function localNow(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

/**
 * Ghi nhận một email đã trao đổi (SCRUM-101, C3).
 *
 * The app has no mailbox access, so this is the owner's record: what was said, when, and where the thread
 * lives. The link is checked before the request (`https://mail.google.com/…` only) because it is rendered
 * into an anchor; the API repeats the rule and the column CHECK repeats it once more.
 */
export default function EmailLogDialog({
  customers,
  contracts,
  initialCustomerId,
  initialContractId,
  onClose,
  onSaved,
}: {
  customers: CustomerOverview[];
  contracts: ContractOverview[];
  initialCustomerId?: string;
  initialContractId?: string;
  onClose: () => void;
  onSaved: (email: CustomerEmail) => void;
}) {
  const { t } = useLocale();
  const firstCustomer = initialCustomerId ?? customers[0]?.id ?? "";
  const [customerId, setCustomerId] = useState(firstCustomer);
  const [contractId, setContractId] = useState(initialContractId ?? "");
  const [direction, setDirection] = useState<EmailDirection>("OUTBOUND");
  const [subject, setSubject] = useState("");
  const [counterpartEmail, setCounterpartEmail] = useState(
    customers.find((customer) => customer.id === firstCustomer)?.contact_email ??
      "",
  );
  const [counterpartName, setCounterpartName] = useState("");
  const [sentAt, setSentAt] = useState(localNow);
  const [threadUrl, setThreadUrl] = useState("");
  const [messageId, setMessageId] = useState("");
  const [snippet, setSnippet] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [localError, setLocalError] = useState("");

  const customerContracts = contracts.filter(
    (contract) => contract.customer_id === customerId,
  );

  function changeCustomer(nextId: string) {
    const customer = customers.find((entry) => entry.id === nextId);

    setCustomerId(nextId);
    setCounterpartEmail(customer?.contact_email ?? "");
    setContractId((current) =>
      contracts.some(
        (contract) => contract.id === current && contract.customer_id === nextId,
      )
        ? current
        : "",
    );
  }

  async function submit() {
    setLocalError("");
    setFailure(null);

    if (threadUrl.trim() !== "" && !isGmailThreadUrl(threadUrl.trim())) {
      setLocalError(t("customers.email.threadInvalid"));
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          contractId: contractId || null,
          direction,
          subject,
          counterpartEmail,
          counterpartName: counterpartName || null,
          gmailThreadId: null,
          gmailMessageId: messageId || null,
          gmailThreadUrl: threadUrl.trim() || null,
          // The input is a Bangkok wall clock, so the offset is explicit — `new Date()` would read it as UTC.
          sentAt: new Date(`${sentAt}:00+07:00`).toISOString(),
          snippet: snippet || null,
          body: body || null,
        }),
      });

      if (!response.ok) {
        setFailure({
          status: response.status,
          body: (await response.json().catch(() => null)) as ServerErrorBody,
        });
        return;
      }

      onSaved((await response.json()) as CustomerEmail);
    } catch {
      setFailure({ status: 0, body: { error: t("error.network") } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <CrmModal
      title={t("customers.email.title")}
      description={t("customers.email.hint")}
      error={
        localError ||
        (failure ? errorMessageFor(failure.status, failure.body, t) : "")
      }
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
            value={customerId}
            onChange={(event) => changeCustomer(event.target.value)}
          >
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.company_name}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("customers.column.contract")}>
          <select
            className={INPUT_CLASS}
            value={contractId}
            onChange={(event) => setContractId(event.target.value)}
          >
            <option value="">{t("customers.email.contractOptional")}</option>
            {customerContracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.contract_no}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("customers.column.direction")}>
          <select
            className={INPUT_CLASS}
            value={direction}
            onChange={(event) =>
              setDirection(event.target.value as EmailDirection)
            }
          >
            {EMAIL_DIRECTIONS.map((value) => (
              <option key={value} value={value}>
                {emailDirectionLabel(value, t)}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("customers.email.sentAt")}>
          <input
            type="datetime-local"
            className={INPUT_CLASS}
            value={sentAt}
            onChange={(event) => setSentAt(event.target.value)}
          />
        </Field>

        <Field label={t("customers.column.subject")}>
          <input
            className={INPUT_CLASS}
            value={subject}
            maxLength={200}
            onChange={(event) => setSubject(event.target.value)}
          />
        </Field>

        <Field label={t("customers.email.counterpartEmail")}>
          <input
            type="email"
            className={INPUT_CLASS}
            value={counterpartEmail}
            onChange={(event) => setCounterpartEmail(event.target.value)}
          />
        </Field>

        <Field label={t("customers.email.counterpartName")}>
          <input
            className={INPUT_CLASS}
            value={counterpartName}
            maxLength={120}
            onChange={(event) => setCounterpartName(event.target.value)}
          />
        </Field>

        <Field label={t("customers.email.messageId")}>
          <input
            className={INPUT_CLASS}
            value={messageId}
            maxLength={200}
            onChange={(event) => setMessageId(event.target.value)}
          />
        </Field>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={LABEL_CLASS}>{t("customers.email.threadUrl")}</span>
          <input
            className={INPUT_CLASS}
            value={threadUrl}
            onChange={(event) => setThreadUrl(event.target.value)}
            placeholder="https://mail.google.com/mail/u/0/#inbox/…"
          />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={LABEL_CLASS}>{t("customers.email.snippet")}</span>
          <textarea
            className={`${INPUT_CLASS} min-h-20`}
            value={snippet}
            maxLength={500}
            onChange={(event) => setSnippet(event.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={LABEL_CLASS}>{t("customers.email.body")}</span>
          <textarea
            className={`${INPUT_CLASS} min-h-28`}
            value={body}
            maxLength={8000}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>

      </div>
    </CrmModal>
  );
}
