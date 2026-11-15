"use client";

import { useState } from "react";

import CrmModal, { CrmCancel, CrmSubmit } from "@/components/CrmModal";
import { useLocale } from "@/components/LocaleProvider";
import type { ContractOverview } from "@/lib/domain/entities/CustomerContract";
import { errorMessageFor, type ServerErrorBody } from "@/lib/i18n/serverMessages";

type Failure = { status: number; body: ServerErrorBody };

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-200 bg-surface px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-blue-500/15";
const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-wider text-slate-500";

function businessToday(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Chấm dứt hợp đồng (SCRUM-101): ngày + lý do, không xoá hàng.
 *
 * The dialog is deliberately separate from the edit form: closing a contract is a different decision from
 * correcting one, and the reason it stores is what a reader sees next year when asking why the money
 * stopped.
 */
export default function TerminateContractDialog({
  contract,
  onClose,
  onSaved,
}: {
  contract: ContractOverview;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLocale();
  const [terminatedOn, setTerminatedOn] = useState(businessToday);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function submit() {
    setBusy(true);
    setFailure(null);

    try {
      const response = await fetch(`/api/contracts/${contract.id}/terminate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terminatedOn, reason }),
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
      title={t("customers.terminate.title", { no: contract.contract_no })}
      description={t("customers.terminate.hint")}
      error={failure ? errorMessageFor(failure.status, failure.body, t) : ""}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <CrmCancel label={t("common.cancel")} onClick={onClose} disabled={busy} />
          <CrmSubmit
            label={t("customers.action.terminate")}
            busy={busy}
            onClick={submit}
          />
        </>
      }
    >
      <label className="flex flex-col gap-1">
        <span className={LABEL_CLASS}>{t("customers.terminate.date")}</span>
        <input
          type="date"
          className={INPUT_CLASS}
          value={terminatedOn}
          onChange={(event) => setTerminatedOn(event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL_CLASS}>{t("customers.terminate.reason")}</span>
        <textarea
          className={`${INPUT_CLASS} min-h-24`}
          value={reason}
          maxLength={300}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
    </CrmModal>
  );
}
