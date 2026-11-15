"use client";

import { Mail, Phone } from "lucide-react";
import { useState } from "react";

import CrmModal, { CrmCancel } from "@/components/CrmModal";
import { useLocale } from "@/components/LocaleProvider";
import type { ReminderItem } from "@/lib/domain/entities/CustomerReminder";
import { formatDate } from "@/lib/i18n/format";
import { reminderKindLabel } from "@/lib/i18n/labels";
import { errorMessageFor, type ServerErrorBody } from "@/lib/i18n/serverMessages";
import { businessToday } from "@/lib/usecases/businessDay";
import { gmailComposeUrl } from "@/lib/usecases/gmailLinks";

type Failure = { status: number; body: ServerErrorBody };

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-200 bg-surface px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-blue-500/15";
const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-wider text-slate-500";

/**
 * Soạn và ghi nhận một lần nhắc khách (SCRUM-102, C5).
 *
 * The draft comes from `reminderTemplates.ts` — the same text the log stores — so what was sent and what the
 * app says it would send are one copy. "Mở Gmail" is the only delivery path here: this app has no mail
 * transport and no owner SMTP credentials, and inventing a fake "sent" state would make the reminder trail
 * lie. Recording the send is therefore a deliberate second click.
 */
export default function ReminderComposeDialog({
  item,
  onClose,
  onSaved,
}: {
  item: ReminderItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, locale } = useLocale();
  const [subject, setSubject] = useState(item.subject);
  const [body, setBody] = useState(item.body);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  const alreadyToday =
    item.lastSentAt !== null &&
    businessToday(new Date(item.lastSentAt)) === businessToday();

  async function log(channel: "EMAIL" | "PHONE") {
    setBusy(true);
    setFailure(null);

    try {
      const response = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: item.customerId,
          contractId: item.itemKind === "contract" ? item.itemId : null,
          serviceId: item.itemKind === "service" ? item.itemId : null,
          kind: item.kind,
          dueOn: item.dueOn,
          channel,
          subject: channel === "EMAIL" ? subject : item.subject,
          body: channel === "EMAIL" ? body : null,
          note: null,
        }),
      });

      if (!response.ok) {
        setFailure({
          status: response.status,
          body: (await response.json().catch(() => null)) as ServerErrorBody,
        });
        return;
      }

      onSaved();
    } catch {
      setFailure({ status: 0, body: { error: t("error.network") } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <CrmModal
      title={t("maintenance.reminder.title", {
        kind: reminderKindLabel(item.kind, t),
      })}
      description={t("maintenance.reminder.hint")}
      error={failure ? errorMessageFor(failure.status, failure.body, t) : ""}
      busy={busy}
      wide
      onClose={onClose}
      footer={
        <>
          <CrmCancel label={t("common.cancel")} onClick={onClose} disabled={busy} />
          <button
            type="button"
            onClick={() => log("PHONE")}
            disabled={busy || alreadyToday}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-surface px-3.5 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Phone size={14} aria-hidden="true" />
            {t("maintenance.reminder.call")}
          </button>
          <a
            href={gmailComposeUrl({ to: item.contactEmail, subject, body })}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong"
          >
            <Mail size={14} aria-hidden="true" />
            {t("maintenance.reminder.openGmail")}
          </a>
          <button
            type="button"
            onClick={() => log("EMAIL")}
            disabled={busy || alreadyToday}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("maintenance.reminder.markSent")}
          </button>
        </>
      }
    >
      <div className="rounded-xl border border-slate-200/80 bg-surface-muted px-3 py-2 text-xs text-slate-600">
        <p className="font-semibold text-slate-800">{item.customerName}</p>
        <p className="mt-0.5">
          {item.itemLabel} · {formatDate(item.dueOn, locale)}
        </p>
        <p className="mt-0.5 text-slate-500">{item.contactEmail}</p>
      </div>

      {alreadyToday && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {t("maintenance.reminder.alreadyToday")}
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className={LABEL_CLASS}>{t("maintenance.reminder.to")}</span>
        <input className={INPUT_CLASS} value={item.contactEmail} readOnly />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL_CLASS}>{t("maintenance.reminder.subject")}</span>
        <input
          className={INPUT_CLASS}
          value={subject}
          maxLength={200}
          onChange={(event) => setSubject(event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL_CLASS}>{t("maintenance.reminder.body")}</span>
        <textarea
          className={`${INPUT_CLASS} min-h-48 font-mono text-xs`}
          value={body}
          maxLength={8000}
          onChange={(event) => setBody(event.target.value)}
        />
      </label>

    </CrmModal>
  );
}
