"use client";

import { useState } from "react";

import CrmModal, { CrmCancel, CrmSubmit } from "@/components/CrmModal";
import { useLocale } from "@/components/LocaleProvider";
import type { ServiceOverview } from "@/lib/domain/entities/CustomerService";
import {
  MAINTENANCE_VISIT_KINDS,
  type MaintenanceVisit,
  type MaintenanceVisitKind,
} from "@/lib/domain/entities/MaintenanceVisit";
import { maintenanceVisitKindLabel } from "@/lib/i18n/labels";
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

function businessToday(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type Form = {
  serviceId: string;
  scheduledOn: string;
  completedOn: string;
  kind: MaintenanceVisitKind;
  technician: string;
  cost: string;
  summary: string;
};

function formOf(
  visit: MaintenanceVisit | null,
  services: ServiceOverview[],
  initialServiceId: string | undefined,
): Form {
  if (visit) {
    return {
      serviceId: visit.service_id,
      scheduledOn: visit.scheduled_on,
      completedOn: visit.completed_on ?? "",
      kind: visit.kind,
      technician: visit.technician ?? "",
      cost: String(visit.cost),
      summary: visit.summary ?? "",
    };
  }

  return {
    serviceId: initialServiceId ?? services[0]?.id ?? "",
    scheduledOn: businessToday(),
    completedOn: "",
    kind: "MAINTENANCE",
    technician: "",
    cost: "0",
    summary: "",
  };
}

/**
 * Đặt lịch hoặc hoàn tất một lần bảo trì (SCRUM-102, C5).
 *
 * The customer is not chosen here: it comes from the service, which is what keeps a visit on the right row
 * of the history. Leaving `completedOn` empty keeps the visit planned; filling it requires a summary — the
 * database CHECK and the use case both say so, and `maintenanceVisitState()` then reads it as `DONE`.
 */
export default function MaintenanceVisitDialog({
  visit,
  services,
  initialServiceId,
  onClose,
  onSaved,
}: {
  visit: MaintenanceVisit | null;
  services: ServiceOverview[];
  initialServiceId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLocale();
  const [form, setForm] = useState<Form>(() =>
    formOf(visit, services, initialServiceId),
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  function update(patch: Partial<Form>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function submit() {
    const service = services.find((entry) => entry.id === form.serviceId);

    if (!service) {
      setFailure({ status: 400, body: { error: t("maintenance.loadFailed") } });
      return;
    }

    const payload = {
      serviceId: form.serviceId,
      customerId: service.customer_id,
      scheduledOn: form.scheduledOn,
      completedOn: form.completedOn || null,
      kind: form.kind,
      technician: form.technician || null,
      cost: Number(form.cost),
      summary: form.summary || null,
    };

    setBusy(true);
    setFailure(null);

    try {
      const response = await fetch(
        visit ? `/api/maintenance-visits/${visit.id}` : "/api/maintenance-visits",
        {
          method: visit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

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
      title={t(visit ? "maintenance.form.editVisit" : "maintenance.form.newVisit")}
      description={t("maintenance.form.completeHint")}
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
        <Field label={t("maintenance.form.service")}>
          <select
            className={INPUT_CLASS}
            value={form.serviceId}
            disabled={visit !== null}
            onChange={(event) => update({ serviceId: event.target.value })}
          >
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.service_name} — {service.customer_name}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("maintenance.form.visitKind")}>
          <select
            className={INPUT_CLASS}
            value={form.kind}
            onChange={(event) =>
              update({ kind: event.target.value as MaintenanceVisitKind })
            }
          >
            {MAINTENANCE_VISIT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {maintenanceVisitKindLabel(kind, t)}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("maintenance.form.scheduledOn")}>
          <input
            type="date"
            className={INPUT_CLASS}
            value={form.scheduledOn}
            onChange={(event) => update({ scheduledOn: event.target.value })}
          />
        </Field>

        <Field label={t("maintenance.form.completedOn")}>
          <input
            type="date"
            className={INPUT_CLASS}
            value={form.completedOn}
            onChange={(event) => update({ completedOn: event.target.value })}
          />
        </Field>

        <Field label={t("maintenance.form.technician")}>
          <input
            className={INPUT_CLASS}
            value={form.technician}
            maxLength={120}
            onChange={(event) => update({ technician: event.target.value })}
          />
        </Field>

        <Field label={t("maintenance.form.cost")}>
          <input
            type="number"
            min={0}
            className={INPUT_CLASS}
            value={form.cost}
            onChange={(event) => update({ cost: event.target.value })}
          />
        </Field>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={LABEL_CLASS}>{t("maintenance.form.summary")}</span>
          <textarea
            className={`${INPUT_CLASS} min-h-24`}
            value={form.summary}
            maxLength={1000}
            onChange={(event) => update({ summary: event.target.value })}
          />
        </label>

      </div>
    </CrmModal>
  );
}
