"use client";

import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import ConfirmDialog from "@/components/ConfirmDialog";
import CustomerServiceDialog, {
  type ServiceSavedEvent,
} from "@/components/CustomerServiceDialog";
import { useLocale } from "@/components/LocaleProvider";
import MaintenanceVisitDialog from "@/components/MaintenanceVisitDialog";
import PercentageBar from "@/components/PercentageBar";
import ReminderComposeDialog from "@/components/ReminderComposeDialog";
import type { ContractOverview } from "@/lib/domain/entities/CustomerContract";
import type { CustomerOverview } from "@/lib/domain/entities/Customer";
import {
  MAINTENANCE_STATES,
  type MaintenanceState,
  type ServiceOverview,
} from "@/lib/domain/entities/CustomerService";
import type { ReminderItem } from "@/lib/domain/entities/CustomerReminder";
import {
  maintenanceVisitState,
  type MaintenanceVisit,
} from "@/lib/domain/entities/MaintenanceVisit";
import type { MaintenanceSummary } from "@/lib/domain/entities/MaintenanceSummary";
import { EMPTY_MAINTENANCE_SUMMARY } from "@/lib/domain/entities/MaintenanceSummary";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/i18n/format";
import {
  maintenanceStateLabel,
  maintenanceVisitKindLabel,
  maintenanceVisitStateLabel,
  reminderKindLabel,
  warrantyStateLabel,
} from "@/lib/i18n/labels";
import { errorMessageFor, type ServerErrorBody } from "@/lib/i18n/serverMessages";
import type { MessageKey } from "@/lib/i18n/translate";
import { businessToday } from "@/lib/usecases/businessDay";

type DialogState =
  | { kind: "service"; service: ServiceOverview | null }
  | { kind: "visit"; visit: MaintenanceVisit | null; serviceId?: string }
  | { kind: "reminder"; item: ReminderItem }
  | { kind: "delete-service"; service: ServiceOverview }
  | { kind: "delete-visit"; visit: MaintenanceVisit };

type Data = {
  services: ServiceOverview[];
  visits: MaintenanceVisit[];
  reminders: ReminderItem[];
  summary: MaintenanceSummary;
  customers: CustomerOverview[];
  contracts: ContractOverview[];
};

const EMPTY_DATA: Data = {
  services: [],
  visits: [],
  reminders: [],
  summary: EMPTY_MAINTENANCE_SUMMARY,
  customers: [],
  contracts: [],
};

const MAINTENANCE_BADGES: Record<MaintenanceState, string> = {
  NONE: "border-slate-200 bg-slate-100 text-slate-500",
  OK: "border-emerald-200 bg-emerald-50 text-emerald-700",
  DUE_SOON: "border-amber-200 bg-amber-50 text-amber-700",
  OVERDUE: "border-rose-200 bg-rose-50 text-rose-700",
};

const VISIT_BADGES: Record<string, string> = {
  PLANNED: "border-blue-200 bg-blue-50 text-primary",
  OVERDUE: "border-rose-200 bg-rose-50 text-rose-700",
  DONE: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const INPUT_CLASS =
  "rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs text-slate-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-blue-500/15";

const TABLE_HEAD =
  "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400";
const TABLE_CELL = "px-3 py-2.5 text-slate-700";

function KpiCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  tone: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}>
          {icon}
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{hint}</p>
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-surface px-6 py-10 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">{hint}</p>
    </div>
  );
}

export default function MaintenancePage() {
  const { t, locale } = useLocale();
  const [tab, setTab] = useState<"todo" | "services" | "visits">("todo");
  const [stateFilter, setStateFilter] = useState<"" | MaintenanceState>("");
  const [data, setData] = useState<Data>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load(): Promise<{ data: Data; error: string | null }> {
      const query = new URLSearchParams();
      if (stateFilter) query.set("state", stateFilter);

      const options = { cache: "no-store" as const, signal: controller.signal };
      const [
        summaryResponse,
        servicesResponse,
        visitsResponse,
        remindersResponse,
        customersResponse,
        contractsResponse,
      ] = await Promise.all([
        fetch("/api/maintenance/summary", options),
        fetch(`/api/services?${query.toString()}`, options),
        fetch("/api/maintenance-visits", options),
        fetch("/api/reminders", options),
        fetch("/api/customers", options),
        fetch("/api/contracts", options),
      ]);

      if (!servicesResponse.ok) {
        return {
          data: EMPTY_DATA,
          error:
            servicesResponse.status >= 500
              ? t("maintenance.loadFailed")
              : errorMessageFor(
                  servicesResponse.status,
                  (await servicesResponse
                    .json()
                    .catch(() => null)) as ServerErrorBody,
                  t,
                ),
        };
      }

      const [services, visits, reminders, summary, customers, contracts] =
        await Promise.all([
          servicesResponse.json() as Promise<ServiceOverview[]>,
          visitsResponse.ok
            ? (visitsResponse.json() as Promise<MaintenanceVisit[]>)
            : Promise.resolve([] as MaintenanceVisit[]),
          remindersResponse.ok
            ? (remindersResponse.json() as Promise<ReminderItem[]>)
            : Promise.resolve([] as ReminderItem[]),
          summaryResponse.ok
            ? (summaryResponse.json() as Promise<MaintenanceSummary>)
            : Promise.resolve(EMPTY_MAINTENANCE_SUMMARY),
          customersResponse.ok
            ? (customersResponse.json() as Promise<CustomerOverview[]>)
            : Promise.resolve([] as CustomerOverview[]),
          contractsResponse.ok
            ? (contractsResponse.json() as Promise<ContractOverview[]>)
            : Promise.resolve([] as ContractOverview[]),
        ]);

      return {
        data: { services, visits, reminders, summary, customers, contracts },
        error: null,
      };
    }

    load()
      .then((result) => {
        if (cancelled) {
          return;
        }

        setData(result.data);
        setPageError(result.error ?? "");
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (
          cancelled ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }

        setPageError(t("error.network"));
        setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [stateFilter, reloadToken, t]);

  const serviceById = useMemo(
    () => new Map(data.services.map((service) => [service.id, service])),
    [data.services],
  );
  const today = businessToday();

  function reload(nextNotice?: MessageKey) {
    if (nextNotice) {
      setNotice(nextNotice);
    }

    setLoading(true);
    setReloadToken((value) => value + 1);
  }

  function closeDialog() {
    setDialog(null);
    setDeleteError("");
  }

  function handleServiceSaved(event: ServiceSavedEvent) {
    closeDialog();
    reload(
      event === "created"
        ? "maintenance.notice.serviceCreated"
        : "maintenance.notice.serviceUpdated",
    );
  }

  async function confirmDelete() {
    if (
      !dialog ||
      (dialog.kind !== "delete-service" && dialog.kind !== "delete-visit")
    ) {
      return;
    }

    const isService = dialog.kind === "delete-service";
    const id = isService ? dialog.service.id : dialog.visit.id;

    setDeleting(true);
    setDeleteError("");

    try {
      const response = await fetch(
        isService
          ? `/api/services/${id}`
          : `/api/maintenance-visits/${id}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        setDeleteError(
          errorMessageFor(
            response.status,
            (await response.json().catch(() => null)) as ServerErrorBody,
            t,
          ),
        );
        return;
      }

      closeDialog();
      reload(
        isService
          ? "maintenance.notice.serviceDeleted"
          : "maintenance.notice.visitDeleted",
      );
    } catch {
      setDeleteError(t("error.network"));
    } finally {
      setDeleting(false);
    }
  }

  const tabs = [
    { id: "todo" as const, label: t("maintenance.tab.todo") },
    { id: "services" as const, label: t("maintenance.tab.services") },
    { id: "visits" as const, label: t("maintenance.tab.visits") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {t("maintenance.eyebrow")}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {t("maintenance.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            {t("maintenance.subtitle")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => reload()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-surface-muted"
          >
            <RefreshCw size={14} aria-hidden="true" />
            {t("common.reload")}
          </button>
          <button
            type="button"
            disabled={data.customers.length === 0}
            onClick={() => setDialog({ kind: "service", service: null })}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={14} aria-hidden="true" />
            {t("maintenance.addService")}
          </button>
          <button
            type="button"
            disabled={data.services.length === 0}
            onClick={() => setDialog({ kind: "visit", visit: null })}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CalendarClock size={14} aria-hidden="true" />
            {t("maintenance.addVisit")}
          </button>
        </div>
      </div>

      {pageError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
        >
          <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          {pageError}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"
        >
          {t(notice)}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t("maintenance.kpi.services")}
          value={String(data.summary.services_total)}
          hint={t("maintenance.kpi.servicesHint", {
            count: data.summary.services_active,
          })}
          tone="bg-blue-50 text-primary"
          icon={<ClipboardList size={16} />}
        />
        <KpiCard
          label={t("maintenance.kpi.inWarranty")}
          value={String(data.summary.in_warranty)}
          hint={t("maintenance.kpi.inWarrantyHint", {
            count: data.summary.warranty_expired,
          })}
          tone="bg-emerald-50 text-emerald-600"
          icon={<ShieldCheck size={16} />}
        />
        <KpiCard
          label={t("maintenance.kpi.dueSoon")}
          value={String(data.summary.due_soon)}
          hint={t("maintenance.kpi.dueSoonHint")}
          tone="bg-amber-50 text-amber-600"
          icon={<CalendarClock size={16} />}
        />
        <KpiCard
          label={t("maintenance.kpi.overdue")}
          value={String(data.summary.overdue)}
          hint={t("maintenance.kpi.overdueHint", {
            count: data.summary.overdue_visits,
          })}
          tone="bg-rose-50 text-rose-600"
          icon={<Wrench size={16} />}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200/80 bg-surface p-1">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                setTab(entry.id);

                // Leaving the warranty tab also drops its state filter: the maintenance history looks up
                // each visit's service in that same list, and a filtered list would blank the name.
                if (entry.id !== "services" && stateFilter !== "") {
                  setLoading(true);
                  setStateFilter("");
                }
              }}
              aria-pressed={tab === entry.id}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                tab === entry.id
                  ? "bg-primary text-white shadow-sm"
                  : "text-slate-600 hover:bg-surface-muted"
              }`}
            >
              {entry.label}
              {entry.id === "todo" && data.reminders.length > 0 && (
                <span className="ml-2 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
                  {data.reminders.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "services" && (
          <select
            value={stateFilter}
            onChange={(event) => {
              setLoading(true);
              setStateFilter(event.target.value as "" | MaintenanceState);
            }}
            aria-label={t("maintenance.column.maintenance")}
            className={INPUT_CLASS}
          >
            <option value="">{t("common.allStatuses")}</option>
            {MAINTENANCE_STATES.map((state) => (
              <option key={state} value={state}>
                {maintenanceStateLabel(state, t)}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading && data.services.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-surface py-16 text-xs text-slate-500">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          {t("header.loading")}
        </div>
      ) : tab === "todo" ? (
        data.reminders.length === 0 ? (
          <EmptyState
            title={t("maintenance.empty.todo")}
            hint={t("maintenance.empty.todoHint")}
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-surface">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-slate-200/80 bg-surface-muted">
                <tr>
                  <th className={TABLE_HEAD}>{t("maintenance.column.due")}</th>
                  <th className={TABLE_HEAD}>{t("maintenance.column.kind")}</th>
                  <th className={TABLE_HEAD}>{t("maintenance.column.customer")}</th>
                  <th className={TABLE_HEAD}>{t("maintenance.column.item")}</th>
                  <th className={TABLE_HEAD}>{t("maintenance.column.daysLeft")}</th>
                  <th className={TABLE_HEAD}>{t("maintenance.column.lastSent")}</th>
                  <th className={TABLE_HEAD}>{t("maintenance.column.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {data.reminders.map((item) => {
                  const remindedToday =
                    item.lastSentAt !== null &&
                    businessToday(new Date(item.lastSentAt)) === today;

                  return (
                    <tr
                      key={item.key}
                      className="border-b border-slate-100 last:border-0 hover:bg-surface-muted/60"
                    >
                      <td className={`${TABLE_CELL} whitespace-nowrap text-xs`}>
                        {formatDate(item.dueOn, locale)}
                      </td>
                      <td className={`${TABLE_CELL} whitespace-nowrap text-xs`}>
                        {reminderKindLabel(item.kind, t)}
                      </td>
                      <td className={TABLE_CELL}>
                        <p className="text-xs font-medium text-slate-800">
                          {item.customerName}
                        </p>
                        <p className="text-[11px] text-slate-500">{item.appName}</p>
                      </td>
                      <td className={`${TABLE_CELL} whitespace-nowrap text-xs`}>
                        {item.itemLabel}
                      </td>
                      <td className={TABLE_CELL}>
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            item.daysLeft < 0
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : item.daysLeft <= 14
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {item.daysLeft === 0
                            ? t("maintenance.daysToday")
                            : item.daysLeft > 0
                              ? t("maintenance.daysLeft", { count: item.daysLeft })
                              : t("maintenance.daysOverdue", {
                                  count: Math.abs(item.daysLeft),
                                })}
                        </span>
                      </td>
                      <td className={`${TABLE_CELL} whitespace-nowrap text-[11px]`}>
                        {item.lastSentAt
                          ? formatDateTime(item.lastSentAt, locale)
                          : "—"}
                        {remindedToday && (
                          <p className="text-[10px] text-amber-600">
                            {t("maintenance.reminder.alreadyToday")}
                          </p>
                        )}
                      </td>
                      <td className={TABLE_CELL}>
                        <button
                          type="button"
                          onClick={() => setDialog({ kind: "reminder", item })}
                          className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-semibold text-primary transition-colors hover:bg-blue-100"
                        >
                          <Mail size={13} aria-hidden="true" />
                          {t("maintenance.action.compose")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )

      ) : tab === "services" ? (
        data.services.length === 0 ? (
          <EmptyState
            title={t("maintenance.empty.services")}
            hint={t("maintenance.empty.servicesHint")}
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-surface">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="border-b border-slate-200/80 bg-surface-muted">
                <tr>
                  <th className={TABLE_HEAD}>{t("maintenance.column.service")}</th>
                  <th className={TABLE_HEAD}>{t("maintenance.column.customer")}</th>
                  <th className={TABLE_HEAD}>{t("maintenance.column.warranty")}</th>
                  <th className={TABLE_HEAD}>{t("maintenance.column.interval")}</th>
                  <th className={TABLE_HEAD}>{t("maintenance.column.lastDone")}</th>
                  <th className={TABLE_HEAD}>{t("maintenance.column.nextDue")}</th>
                  <th className={TABLE_HEAD}>{t("maintenance.column.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {data.services.map((service) => (
                  <tr
                    key={service.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-surface-muted/60"
                  >
                    <td className={TABLE_CELL}>
                      <p className="text-xs font-semibold text-slate-900">
                        {service.service_name}
                      </p>
                      {service.serial_no && (
                        <p className="text-[11px] text-slate-500">
                          {service.serial_no}
                        </p>
                      )}
                    </td>
                    <td className={TABLE_CELL}>
                      <p className="text-xs">{service.customer_name}</p>
                      <p className="text-[11px] text-slate-500">
                        {service.contract_no ?? service.app_name}
                      </p>
                    </td>
                    <td className={`${TABLE_CELL} whitespace-nowrap text-[11px]`}>
                      <p>
                        {formatDate(service.warranty_start_on, locale)} →{" "}
                        {formatDate(service.warranty_end_on, locale)}
                      </p>
                      <span
                        className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          service.warranty_state === "EXPIRED"
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : service.warranty_state === "EXPIRING"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : service.warranty_state === "NONE"
                                ? "border-slate-200 bg-slate-100 text-slate-500"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {warrantyStateLabel(service.warranty_state, t)}
                      </span>
                      {service.warranty_months > 0 && (
                        <PercentageBar
                          start={service.warranty_start_on}
                          end={service.warranty_end_on}
                          today={today}
                          label={(percent) =>
                            t("maintenance.remainingPercent", { count: percent })
                          }
                        />
                      )}
                    </td>
                    <td className={`${TABLE_CELL} whitespace-nowrap text-xs`}>
                      {service.maintenance_interval_months === 0
                        ? t("maintenanceState.NONE")
                        : t("maintenance.monthsShort", {
                            count: service.maintenance_interval_months,
                          })}
                    </td>
                    <td className={`${TABLE_CELL} whitespace-nowrap text-xs`}>
                      {formatDate(service.last_completed_on, locale)}
                    </td>
                    <td className={`${TABLE_CELL} whitespace-nowrap text-xs`}>
                      <p>{formatDate(service.next_due_on, locale)}</p>
                      <span
                        className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          MAINTENANCE_BADGES[service.maintenance_state]
                        }`}
                      >
                        {maintenanceStateLabel(service.maintenance_state, t)}
                      </span>
                    </td>
                    <td className={TABLE_CELL}>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          title={t("common.edit")}
                          aria-label={t("common.edit")}
                          onClick={() => setDialog({ kind: "service", service })}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-surface-muted hover:text-slate-800"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          title={t("maintenance.addVisit")}
                          aria-label={t("maintenance.addVisit")}
                          onClick={() =>
                            setDialog({
                              kind: "visit",
                              visit: null,
                              serviceId: service.id,
                            })
                          }
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 text-primary transition-colors hover:bg-blue-50"
                        >
                          <CalendarClock size={14} />
                        </button>
                        <button
                          type="button"
                          title={t("common.delete")}
                          aria-label={t("common.delete")}
                          onClick={() =>
                            setDialog({ kind: "delete-service", service })
                          }
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 text-rose-600 transition-colors hover:bg-rose-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )

      ) : (
        data.visits.length === 0 ? (
          <EmptyState
            title={t("maintenance.empty.visits")}
            hint={t("maintenance.empty.visitsHint")}
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-surface">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="border-b border-slate-200/80 bg-surface-muted">
                <tr>
                  <th className={TABLE_HEAD}>{t("maintenance.column.scheduled")}</th>
                  <th className={TABLE_HEAD}>{t("maintenance.column.completed")}</th>
                  <th className={TABLE_HEAD}>{t("maintenance.column.service")}</th>
                  <th className={TABLE_HEAD}>{t("maintenance.column.customer")}</th>
                  <th className={TABLE_HEAD}>{t("maintenance.column.kind")}</th>
                  <th className={TABLE_HEAD}>{t("maintenance.column.technician")}</th>
                  <th className={TABLE_HEAD}>{t("maintenance.column.cost")}</th>
                  <th className={TABLE_HEAD}>{t("maintenance.column.visitState")}</th>
                  <th className={TABLE_HEAD}>{t("maintenance.column.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {data.visits.map((visit) => {
                  const service = serviceById.get(visit.service_id);
                  const state = maintenanceVisitState(visit, today);

                  return (
                    <tr
                      key={visit.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-surface-muted/60"
                    >
                      <td className={`${TABLE_CELL} whitespace-nowrap text-xs`}>
                        {formatDate(visit.scheduled_on, locale)}
                      </td>
                      <td className={`${TABLE_CELL} whitespace-nowrap text-xs`}>
                        {formatDate(visit.completed_on, locale)}
                      </td>
                      <td className={TABLE_CELL}>
                        <p className="text-xs font-medium text-slate-800">
                          {service?.service_name ?? "—"}
                        </p>
                        {visit.summary && (
                          <p className="max-w-xs truncate text-[11px] text-slate-500">
                            {visit.summary}
                          </p>
                        )}
                      </td>
                      <td className={TABLE_CELL}>
                        <p className="text-xs">
                          {service?.customer_name ?? "—"}
                        </p>
                      </td>
                      <td className={`${TABLE_CELL} whitespace-nowrap text-xs`}>
                        {maintenanceVisitKindLabel(visit.kind, t)}
                      </td>
                      <td className={`${TABLE_CELL} whitespace-nowrap text-xs`}>
                        {visit.technician ?? "—"}
                      </td>
                      <td className={`${TABLE_CELL} whitespace-nowrap text-xs`}>
                        {formatCurrency(visit.cost, locale)}
                      </td>
                      <td className={TABLE_CELL}>
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            VISIT_BADGES[state]
                          }`}
                        >
                          {maintenanceVisitStateLabel(state, t)}
                        </span>
                      </td>
                      <td className={TABLE_CELL}>
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            title={
                              state === "DONE"
                                ? t("common.edit")
                                : t("maintenance.action.complete")
                            }
                            aria-label={
                              state === "DONE"
                                ? t("common.edit")
                                : t("maintenance.action.complete")
                            }
                            onClick={() =>
                              setDialog({ kind: "visit", visit })
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 text-emerald-600 transition-colors hover:bg-emerald-50"
                          >
                            {state === "DONE" ? (
                              <Pencil size={14} />
                            ) : (
                              <CheckCircle2 size={14} />
                            )}
                          </button>
                          <button
                            type="button"
                            title={t("common.delete")}
                            aria-label={t("common.delete")}
                            onClick={() => setDialog({ kind: "delete-visit", visit })}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 text-rose-600 transition-colors hover:bg-rose-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )

      )}

      {dialog?.kind === "service" && data.customers.length > 0 && (
        <CustomerServiceDialog
          service={dialog.service}
          customers={data.customers}
          contracts={data.contracts}
          initialCustomerId={dialog.service?.customer_id}
          onClose={closeDialog}
          onSaved={handleServiceSaved}
        />
      )}

      {dialog?.kind === "visit" && data.services.length > 0 && (
        <MaintenanceVisitDialog
          visit={dialog.visit}
          services={data.services}
          initialServiceId={dialog.serviceId}
          onClose={closeDialog}
          onSaved={() => {
            const created = dialog.visit === null;

            closeDialog();
            reload(
              created
                ? "maintenance.notice.visitCreated"
                : "maintenance.notice.visitUpdated",
            );
          }}
        />
      )}

      {dialog?.kind === "reminder" && (
        <ReminderComposeDialog
          item={dialog.item}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog();
            reload("maintenance.notice.reminderLogged");
          }}
        />
      )}

      {(dialog?.kind === "delete-service" || dialog?.kind === "delete-visit") && (
        <ConfirmDialog
          title={t(
            dialog.kind === "delete-service"
              ? "maintenance.confirm.serviceTitle"
              : "maintenance.confirm.visitTitle",
          )}
          description={t(
            dialog.kind === "delete-service"
              ? "maintenance.confirm.serviceNote"
              : "maintenance.confirm.visitNote",
          )}
          confirmLabel={t("common.delete")}
          error={deleteError}
          busy={deleting}
          tone="danger"
          onConfirm={confirmDelete}
          onCancel={closeDialog}
        />
      )}


    </div>
  );
}


