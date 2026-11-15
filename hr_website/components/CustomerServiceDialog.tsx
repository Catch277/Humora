"use client";

import { useState } from "react";

import CrmModal, { CrmCancel, CrmSubmit } from "@/components/CrmModal";
import { useLocale } from "@/components/LocaleProvider";
import type { ContractOverview } from "@/lib/domain/entities/CustomerContract";
import type { CustomerOverview } from "@/lib/domain/entities/Customer";
import {
  CUSTOMER_SERVICE_STATUSES,
  type CustomerServiceStatus,
  type ServiceOverview,
} from "@/lib/domain/entities/CustomerService";
import { serviceStatusLabel } from "@/lib/i18n/labels";
import { errorMessageFor, type ServerErrorBody } from "@/lib/i18n/serverMessages";

export type ServiceSavedEvent = "created" | "updated";

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
  customerId: string;
  contractId: string;
  serviceName: string;
  serialNo: string;
  warrantyStartOn: string;
  warrantyMonths: string;
  maintenanceIntervalMonths: string;
  status: CustomerServiceStatus;
  note: string;
};

function formOf(
  service: ServiceOverview | null,
  customers: CustomerOverview[],
  initialCustomerId: string | undefined,
): Form {
  if (service) {
    return {
      customerId: service.customer_id,
      contractId: service.contract_id ?? "",
      serviceName: service.service_name,
      serialNo: service.serial_no ?? "",
      warrantyStartOn: service.warranty_start_on,
      warrantyMonths: String(service.warranty_months),
      maintenanceIntervalMonths: String(service.maintenance_interval_months),
      status: service.status,
      note: service.note ?? "",
    };
  }

  const customerId = initialCustomerId ?? customers[0]?.id ?? "";
  const customer = customers.find((entry) => entry.id === customerId);

  return {
    customerId,
    contractId: "",
    serviceName: customer?.app_name ?? "",
    serialNo: "",
    warrantyStartOn: businessToday(),
    warrantyMonths: "12",
    maintenanceIntervalMonths: "6",
    status: "ACTIVE",
    note: "",
  };
}

/**
 * Một dịch vụ đã bán kèm bảo hành (SCRUM-102, C5).
 *
 * `warrantyEndOn` is not a field: the database derives it from the start and the months, so the same two
 * numbers cannot produce two different end dates. `maintenanceIntervalMonths = 0` is a real answer — "no
 * periodic maintenance" — and the read RPC reports it as `NONE` instead of inventing a due date.
 */
export default function CustomerServiceDialog({
  service,
  customers,
  contracts,
  initialCustomerId,
  onClose,
  onSaved,
}: {
  service: ServiceOverview | null;
  customers: CustomerOverview[];
  contracts: ContractOverview[];
  initialCustomerId?: string;
  onClose: () => void;
  onSaved: (event: ServiceSavedEvent) => void;
}) {
  const { t } = useLocale();
  const [form, setForm] = useState<Form>(() =>
    formOf(service, customers, initialCustomerId),
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  function update(patch: Partial<Form>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  const customerContracts = contracts.filter(
    (contract) => contract.customer_id === form.customerId,
  );

  function changeCustomer(nextId: string) {
    const customer = customers.find((entry) => entry.id === nextId);

    update({
      customerId: nextId,
      contractId: "",
      serviceName: form.serviceName || customer?.app_name || "",
    });
  }

  async function submit() {
    setBusy(true);
    setFailure(null);

    try {
      const response = await fetch(
        service ? `/api/services/${service.id}` : "/api/services",
        {
          method: service ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId: form.customerId,
            contractId: form.contractId || null,
            serviceName: form.serviceName,
            serialNo: form.serialNo || null,
            warrantyStartOn: form.warrantyStartOn,
            warrantyMonths: Number(form.warrantyMonths),
            maintenanceIntervalMonths: Number(form.maintenanceIntervalMonths),
            status: form.status,
            note: form.note || null,
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

      onSaved(service ? "updated" : "created");
    } catch {
      setFailure({ status: 0, body: { error: t("error.network") } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <CrmModal
      title={t(
        service ? "maintenance.form.editService" : "maintenance.form.newService",
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
        <Field label={t("maintenance.form.customer")}>
          <select
            className={INPUT_CLASS}
            value={form.customerId}
            onChange={(event) => changeCustomer(event.target.value)}
          >
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.company_name}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("maintenance.form.contract")}>
          <select
            className={INPUT_CLASS}
            value={form.contractId}
            onChange={(event) => update({ contractId: event.target.value })}
          >
            <option value="">{t("maintenance.form.contractOptional")}</option>
            {customerContracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.contract_no}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("maintenance.form.serviceName")}>
          <input
            className={INPUT_CLASS}
            value={form.serviceName}
            maxLength={120}
            onChange={(event) => update({ serviceName: event.target.value })}
          />
        </Field>

        <Field label={t("maintenance.form.serialNo")}>
          <input
            className={INPUT_CLASS}
            value={form.serialNo}
            maxLength={80}
            onChange={(event) => update({ serialNo: event.target.value })}
          />
        </Field>

        <Field label={t("maintenance.form.warrantyStart")}>
          <input
            type="date"
            className={INPUT_CLASS}
            value={form.warrantyStartOn}
            onChange={(event) => update({ warrantyStartOn: event.target.value })}
          />
        </Field>

        <Field label={t("maintenance.form.warrantyMonths")}>
          <input
            type="number"
            min={0}
            max={120}
            className={INPUT_CLASS}
            value={form.warrantyMonths}
            onChange={(event) => update({ warrantyMonths: event.target.value })}
          />
        </Field>

        <Field label={t("maintenance.form.interval")}>
          <input
            type="number"
            min={0}
            max={60}
            className={INPUT_CLASS}
            value={form.maintenanceIntervalMonths}
            onChange={(event) =>
              update({ maintenanceIntervalMonths: event.target.value })
            }
          />
        </Field>

        <Field label={t("maintenance.form.serviceStatus")}>
          <select
            className={INPUT_CLASS}
            value={form.status}
            onChange={(event) =>
              update({ status: event.target.value as CustomerServiceStatus })
            }
          >
            {CUSTOMER_SERVICE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {serviceStatusLabel(status, t)}
              </option>
            ))}
          </select>
        </Field>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={LABEL_CLASS}>{t("maintenance.form.note")}</span>
          <textarea
            className={`${INPUT_CLASS} min-h-20`}
            value={form.note}
            maxLength={1000}
            onChange={(event) => update({ note: event.target.value })}
          />
        </label>

      </div>
    </CrmModal>
  );
}
