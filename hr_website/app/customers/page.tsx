"use client";

import {
  Ban,
  CircleDollarSign,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Repeat2,
  Search,
  Trash2,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import ConfirmDialog from "@/components/ConfirmDialog";
import ContractDialog, {
  type ContractDialogMode,
  type ContractSavedEvent,
} from "@/components/ContractDialog";
import CustomerDialog, {
  type CustomerSavedEvent,
} from "@/components/CustomerDialog";
import EmailLogDialog from "@/components/EmailLogDialog";
import LeadDialog from "@/components/LeadDialog";
import { useLocale } from "@/components/LocaleProvider";
import PercentageBar from "@/components/PercentageBar";
import TerminateContractDialog from "@/components/TerminateContractDialog";
import type { ContractSummary } from "@/lib/domain/entities/ContractSummary";
import { EMPTY_CONTRACT_SUMMARY } from "@/lib/domain/entities/ContractSummary";
import {
  CONTRACT_EFFECTIVE_STATUSES,
  type ContractEffectiveStatus,
  type ContractOverview,
} from "@/lib/domain/entities/CustomerContract";
import type { CustomerOverview } from "@/lib/domain/entities/Customer";
import {
  LEAD_STATUSES,
  type CustomerLead,
  type LeadStatus,
} from "@/lib/domain/entities/CustomerLead";
import {
  EMAIL_DIRECTIONS,
  type CustomerEmail,
  type EmailDirection,
} from "@/lib/domain/entities/CustomerEmail";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/i18n/format";
import {
  billingCycleLabel,
  contractPlanLabel,
  contractStatusLabel,
  customerStatusLabel,
  emailDirectionLabel,
  leadStatusLabel,
} from "@/lib/i18n/labels";
import { errorMessageFor, type ServerErrorBody } from "@/lib/i18n/serverMessages";
import type { MessageKey } from "@/lib/i18n/translate";
import { businessToday } from "@/lib/usecases/businessDay";
import { gmailSearchUrl } from "@/lib/usecases/gmailLinks";

type DialogState =
  | { kind: "customer"; customer: CustomerOverview | null }
  | { kind: "contract"; mode: ContractDialogMode; contract: ContractOverview | null }
  | { kind: "email"; customerId?: string; contractId?: string }
  | { kind: "terminate"; contract: ContractOverview }
  | { kind: "lead" }
  | { kind: "delete-customer"; customer: CustomerOverview }
  | { kind: "delete-contract"; contract: ContractOverview }
  | { kind: "delete-lead"; lead: CustomerLead };

type Data = {
  customers: CustomerOverview[];
  contracts: ContractOverview[];
  emails: CustomerEmail[];
  leads: CustomerLead[];
  summary: ContractSummary;
};

const EMPTY_DATA: Data = {
  customers: [],
  contracts: [],
  emails: [],
  leads: [],
  summary: EMPTY_CONTRACT_SUMMARY,
};

const CONTRACT_BADGES: Record<ContractEffectiveStatus, string> = {
  DRAFT: "border-slate-200 bg-slate-100 text-slate-600",
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  EXPIRING: "border-amber-200 bg-amber-50 text-amber-700",
  EXPIRED: "border-rose-200 bg-rose-50 text-rose-700",
  TERMINATED: "border-slate-200 bg-slate-100 text-slate-500",
};

const CUSTOMER_BADGES: Record<string, string> = {
  PROSPECT: "border-blue-200 bg-blue-50 text-primary",
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  SUSPENDED: "border-amber-200 bg-amber-50 text-amber-700",
  CHURNED: "border-slate-200 bg-slate-100 text-slate-500",
};

const INPUT_CLASS =
  "rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs text-slate-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-blue-500/15";

const TABLE_HEAD = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400";
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

export default function CustomersPage() {
  const { t, locale } = useLocale();
  const [tab, setTab] = useState<"customers" | "contracts" | "emails" | "leads">(
    "customers",
  );
  const [data, setData] = useState<Data>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | ContractEffectiveStatus>(
    "",
  );
  const [contractCustomerId, setContractCustomerId] = useState("");
  const [emailDirection, setEmailDirection] = useState<"" | EmailDirection>("");
  const [emailCustomerId, setEmailCustomerId] = useState("");
  const [leadStatusFilter, setLeadStatusFilter] = useState<"" | LeadStatus>("");
  const [reloadToken, setReloadToken] = useState(0);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const timer = setTimeout(
      () => {
        const term = search.trim();
        const customerQuery = new URLSearchParams();
        if (term) customerQuery.set("search", term);

        const contractQuery = new URLSearchParams();
        if (term) contractQuery.set("search", term);
        if (statusFilter) contractQuery.set("status", statusFilter);
        if (contractCustomerId)
          contractQuery.set("customer_id", contractCustomerId);

        const emailQuery = new URLSearchParams();
        if (term) emailQuery.set("search", term);
        if (emailDirection) emailQuery.set("direction", emailDirection);
        if (emailCustomerId) emailQuery.set("customer_id", emailCustomerId);

        const leadQuery = new URLSearchParams();
        if (term) leadQuery.set("search", term);
        if (leadStatusFilter) leadQuery.set("status", leadStatusFilter);

        async function load(): Promise<{ data: Data; error: string | null }> {
          const options = {
            cache: "no-store" as const,
            signal: controller.signal,
          };
          const [
            customersResponse,
            contractsResponse,
            emailsResponse,
            leadsResponse,
            summaryResponse,
          ] = await Promise.all([
            fetch(`/api/customers?${customerQuery.toString()}`, options),
            fetch(`/api/contracts?${contractQuery.toString()}`, options),
            fetch(`/api/emails?${emailQuery.toString()}`, options),
            fetch(`/api/leads?${leadQuery.toString()}`, options),
            fetch("/api/contracts/summary", options),
          ]);

          if (!customersResponse.ok) {
            // A 500 here is almost always the script not being applied yet, and the screen has one sentence
            // for that; a role failure keeps the shared wording so the reader knows what to ask for.
            return {
              data: EMPTY_DATA,
              error:
                customersResponse.status >= 500
                  ? t("customers.loadFailed")
                  : errorMessageFor(
                      customersResponse.status,
                      (await customersResponse
                        .json()
                        .catch(() => null)) as ServerErrorBody,
                      t,
                    ),
            };
          }

          const [customers, contracts, emails, leads, summary] = await Promise.all([
            customersResponse.json() as Promise<CustomerOverview[]>,
            contractsResponse.ok
              ? (contractsResponse.json() as Promise<ContractOverview[]>)
              : Promise.resolve([] as ContractOverview[]),
            emailsResponse.ok
              ? (emailsResponse.json() as Promise<CustomerEmail[]>)
              : Promise.resolve([] as CustomerEmail[]),
            leadsResponse.ok
              ? (leadsResponse.json() as Promise<CustomerLead[]>)
              : Promise.resolve([] as CustomerLead[]),
            summaryResponse.ok
              ? (summaryResponse.json() as Promise<ContractSummary>)
              : Promise.resolve(EMPTY_CONTRACT_SUMMARY),
          ]);

          return {
            data: { customers, contracts, emails, leads, summary },
            error: null,
          };
        }

        setLoading(true);

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
      },
      search.trim() ? 300 : 0,
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    search,
    statusFilter,
    contractCustomerId,
    emailDirection,
    emailCustomerId,
    leadStatusFilter,
    reloadToken,
    t,
  ]);

  const customerById = useMemo(
    () => new Map(data.customers.map((customer) => [customer.id, customer])),
    [data.customers],
  );
  const contractById = useMemo(
    () => new Map(data.contracts.map((contract) => [contract.id, contract])),
    [data.contracts],
  );

  /** The contract a customer is on today — what the "Gói hiện tại" cell shows. */
  function currentContractOf(customerId: string): ContractOverview | null {
    const live = data.contracts
      .filter(
        (contract) =>
          contract.customer_id === customerId &&
          (contract.effective_status === "ACTIVE" ||
            contract.effective_status === "EXPIRING"),
      )
      .sort((a, b) => a.end_date.localeCompare(b.end_date));

    return live.length > 0 ? live[live.length - 1] : null;
  }

  function reload(nextNotice?: MessageKey) {
    if (nextNotice) {
      setNotice(nextNotice);
    }

    setReloadToken((value) => value + 1);
  }

  function closeDialog() {
    setDialog(null);
    setDeleteError("");
  }

  function handleCustomerSaved(event: CustomerSavedEvent) {
    closeDialog();
    reload(
      event === "created"
        ? "customers.notice.customerCreated"
        : "customers.notice.customerUpdated",
    );
  }

  function handleContractSaved(event: ContractSavedEvent) {
    closeDialog();
    reload(
      event === "created"
        ? "customers.notice.contractCreated"
        : event === "updated"
          ? "customers.notice.contractUpdated"
          : "customers.notice.contractRenewed",
    );
  }

  function handleLeadSaved() {
    closeDialog();
    reload("customers.notice.leadCreated");
  }

  /** The status select on a demo request writes immediately; the note and the converted customer stay. */
  async function changeLeadStatus(lead: CustomerLead, status: LeadStatus) {
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          note: lead.note,
          convertedCustomerId: lead.converted_customer_id,
        }),
      });

      if (!response.ok) {
        setPageError(
          errorMessageFor(
            response.status,
            (await response.json().catch(() => null)) as ServerErrorBody,
            t,
          ),
        );
        return;
      }

      reload("customers.notice.leadUpdated");
    } catch {
      setPageError(t("error.network"));
    }
  }

  async function confirmDelete() {
    if (
      !dialog ||
      (dialog.kind !== "delete-customer" &&
        dialog.kind !== "delete-contract" &&
        dialog.kind !== "delete-lead")
    ) {
      return;
    }

    const url =
      dialog.kind === "delete-customer"
        ? `/api/customers/${dialog.customer.id}`
        : dialog.kind === "delete-contract"
          ? `/api/contracts/${dialog.contract.id}`
          : `/api/leads/${dialog.lead.id}`;

    setDeleting(true);
    setDeleteError("");

    try {
      const response = await fetch(url, { method: "DELETE" });

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

      const noticeKey: MessageKey =
        dialog.kind === "delete-customer"
          ? "customers.notice.customerDeleted"
          : dialog.kind === "delete-contract"
            ? "customers.notice.contractDeleted"
            : "customers.notice.leadDeleted";

      closeDialog();
      reload(noticeKey);
    } catch {
      setDeleteError(t("error.network"));
    } finally {
      setDeleting(false);
    }
  }

  const tabs = [
    { id: "customers" as const, label: t("customers.tab.customers") },
    { id: "contracts" as const, label: t("customers.tab.contracts") },
    { id: "emails" as const, label: t("customers.tab.emails") },
    { id: "leads" as const, label: t("customers.tab.leads") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {t("customers.eyebrow")}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {t("customers.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            {t("customers.subtitle")}
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
            onClick={() => setDialog({ kind: "customer", customer: null })}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-blue-100"
          >
            <Plus size={14} aria-hidden="true" />
            {t("customers.addCustomer")}
          </button>
          <button
            type="button"
            onClick={() => setDialog({ kind: "lead" })}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-surface-muted"
          >
            <Mail size={14} aria-hidden="true" />
            {t("customers.addLead")}
          </button>
          <button
            type="button"
            disabled={data.customers.length === 0}
            onClick={() =>
              setDialog({ kind: "contract", mode: "create", contract: null })
            }
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileText size={14} aria-hidden="true" />
            {t("customers.addContract")}
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
          label={t("customers.kpi.customers")}
          value={String(data.summary.customers_total)}
          hint={t("customers.kpi.customersHint", {
            count: data.summary.customers_active,
          })}
          tone="bg-blue-50 text-primary"
          icon={<Users size={16} />}
        />
        <KpiCard
          label={t("customers.kpi.contracts")}
          value={String(data.summary.contracts_active)}
          hint={t("customers.kpi.contractsHint", {
            count: data.summary.contracts_expired,
          })}
          tone="bg-emerald-50 text-emerald-600"
          icon={<FileText size={16} />}
        />
        <KpiCard
          label={t("customers.kpi.expiring")}
          value={String(data.summary.contracts_expiring)}
          hint={t("customers.kpi.expiringHint")}
          tone="bg-amber-50 text-amber-600"
          icon={<Ban size={16} />}
        />
        <KpiCard
          label={t("customers.kpi.mrr")}
          value={formatCurrency(data.summary.mrr, locale)}
          hint={t("customers.kpi.mrrHint")}
          tone="bg-indigo-50 text-indigo-600"
          icon={<CircleDollarSign size={16} />}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200/80 bg-surface p-1">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              aria-pressed={tab === entry.id}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                tab === entry.id
                  ? "bg-primary text-white shadow-sm"
                  : "text-slate-600 hover:bg-surface-muted"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("customers.searchPlaceholder")}
            aria-label={t("customers.searchPlaceholder")}
            className="w-64 rounded-lg border border-slate-200 bg-surface py-2 pl-8 pr-3 text-xs text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-blue-500/15"
          />
        </div>
      </div>

      {loading && data.customers.length === 0 && data.leads.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-surface py-16 text-xs text-slate-500">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          {t("header.loading")}
        </div>
      ) : tab === "customers" ? (
        data.customers.length === 0 ? (
          <EmptyState
            title={t("customers.empty.customers")}
            hint={t("customers.empty.customersHint")}
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-surface">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-b border-slate-200/80 bg-surface-muted">
                <tr>
                  <th className={TABLE_HEAD}>{t("customers.column.company")}</th>
                  <th className={TABLE_HEAD}>{t("customers.column.contact")}</th>
                  <th className={TABLE_HEAD}>{t("customers.column.plan")}</th>
                  <th className={TABLE_HEAD}>{t("customers.column.contracts")}</th>
                  <th className={TABLE_HEAD}>{t("customers.column.nextEnd")}</th>
                  <th className={TABLE_HEAD}>{t("common.status")}</th>
                  <th className={TABLE_HEAD}>{t("customers.column.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {data.customers.map((customer) => {
                  const current = currentContractOf(customer.id);

                  return (
                    <tr
                      key={customer.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-surface-muted/60"
                    >
                      <td className={TABLE_CELL}>
                        <p className="font-semibold text-slate-900">
                          {customer.company_name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {customer.app_name}
                        </p>
                      </td>
                      <td className={TABLE_CELL}>
                        <p className="text-xs">{customer.contact_name ?? "—"}</p>
                        <a
                          href={`mailto:${customer.contact_email}`}
                          className="text-[11px] text-primary hover:underline"
                        >
                          {customer.contact_email}
                        </a>
                        {customer.contact_phone && (
                          <p className="text-[11px] text-slate-500">
                            {customer.contact_phone}
                          </p>
                        )}
                      </td>
                      <td className={TABLE_CELL}>
                        {current ? (
                          <>
                            <p className="text-xs font-medium">
                              {contractPlanLabel(current.plan_code, t)}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {current.employee_count} ·{" "}
                              {formatCurrency(current.monthly_fee, locale)}
                            </p>
                          </>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                      <td className={TABLE_CELL}>
                        <p className="text-xs">{customer.active_contracts}</p>
                        <p className="text-[11px] text-slate-500">
                          {formatCurrency(customer.monthly_total, locale)}
                        </p>
                      </td>
                      <td className={`${TABLE_CELL} whitespace-nowrap text-xs`}>
                        {formatDate(customer.next_end_date, locale)}
                      </td>
                      <td className={TABLE_CELL}>
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            CUSTOMER_BADGES[customer.status] ??
                            CUSTOMER_BADGES.CHURNED
                          }`}
                        >
                          {customerStatusLabel(customer.status, t)}
                        </span>
                      </td>
                      <td className={TABLE_CELL}>
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            title={t("customers.action.viewContracts")}
                            aria-label={t("customers.action.viewContracts")}
                            onClick={() => {
                              setContractCustomerId(customer.id);
                              setTab("contracts");
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-surface-muted hover:text-slate-800"
                          >
                            <FileText size={14} />
                          </button>
                          <button
                            type="button"
                            title={t("common.edit")}
                            aria-label={t("common.edit")}
                            onClick={() =>
                              setDialog({ kind: "customer", customer })
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-surface-muted hover:text-slate-800"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            title={t("customers.action.logEmail")}
                            aria-label={t("customers.action.logEmail")}
                            onClick={() =>
                              setDialog({ kind: "email", customerId: customer.id })
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-surface-muted hover:text-slate-800"
                          >
                            <Mail size={14} />
                          </button>
                          <a
                            href={gmailSearchUrl(customer.contact_email)}
                            target="_blank"
                            rel="noreferrer noopener"
                            title={t("customers.action.searchGmail")}
                            aria-label={t("customers.action.searchGmail")}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-surface-muted hover:text-slate-800"
                          >
                            <ExternalLink size={14} />
                          </a>
                          <button
                            type="button"
                            title={t("common.delete")}
                            aria-label={t("common.delete")}
                            onClick={() =>
                              setDialog({ kind: "delete-customer", customer })
                            }
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

      ) : tab === "contracts" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "" | ContractEffectiveStatus)
              }
              aria-label={t("common.filterStatusAria")}
              className={INPUT_CLASS}
            >
              <option value="">{t("common.allStatuses")}</option>
              {CONTRACT_EFFECTIVE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {contractStatusLabel(status, t)}
                </option>
              ))}
            </select>

            <select
              value={contractCustomerId}
              onChange={(event) => setContractCustomerId(event.target.value)}
              aria-label={t("customers.column.customer")}
              className={INPUT_CLASS}
            >
              <option value="">
                {t("common.all")} — {t("customers.column.customer")}
              </option>
              {data.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.company_name}
                </option>
              ))}
            </select>

            {contractCustomerId && (
              <button
                type="button"
                onClick={() => setContractCustomerId("")}
                className="rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-surface-muted"
              >
                {t("common.all")}
              </button>
            )}
          </div>

          {data.contracts.length === 0 ? (
            <EmptyState
              title={t("customers.empty.contracts")}
              hint={t("customers.empty.contractsHint")}
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-surface">
              <table className="w-full min-w-[1080px] text-sm">
                <thead className="border-b border-slate-200/80 bg-surface-muted">
                  <tr>
                    <th className={TABLE_HEAD}>{t("customers.column.contractNo")}</th>
                    <th className={TABLE_HEAD}>{t("customers.column.customer")}</th>
                    <th className={TABLE_HEAD}>{t("customers.form.plan")}</th>
                    <th className={TABLE_HEAD}>{t("customers.column.headcount")}</th>
                    <th className={TABLE_HEAD}>{t("customers.column.unitPrice")}</th>
                    <th className={TABLE_HEAD}>{t("customers.column.monthlyFee")}</th>
                    <th className={TABLE_HEAD}>{t("customers.column.term")}</th>
                    <th className={TABLE_HEAD}>{t("customers.column.effectiveStatus")}</th>
                    <th className={TABLE_HEAD}>{t("customers.column.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.contracts.map((contract) => (
                    <tr
                      key={contract.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-surface-muted/60"
                    >
                      <td className={TABLE_CELL}>
                        <p className="whitespace-nowrap font-semibold text-slate-900">
                          {contract.contract_no}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {billingCycleLabel(contract.billing_cycle, t)}
                        </p>
                      </td>
                      <td className={TABLE_CELL}>
                        <p className="text-xs font-medium text-slate-800">
                          {contract.customer_name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {contract.app_name}
                        </p>
                      </td>
                      <td className={`${TABLE_CELL} whitespace-nowrap text-xs`}>
                        {contractPlanLabel(contract.plan_code, t)}
                      </td>
                      <td className={TABLE_CELL}>{contract.employee_count}</td>
                      <td className={`${TABLE_CELL} whitespace-nowrap text-xs`}>
                        {formatCurrency(contract.unit_price, locale)}
                      </td>
                      <td
                        className={`${TABLE_CELL} whitespace-nowrap text-xs font-semibold`}
                      >
                        {formatCurrency(contract.monthly_fee, locale)}
                      </td>
                      <td
                        className={`${TABLE_CELL} whitespace-nowrap text-[11px] text-slate-500`}
                      >
                        <p>
                          {formatDate(contract.start_date, locale)} →{" "}
                          {formatDate(contract.end_date, locale)}
                        </p>
                        <p>
                          {contract.days_to_end >= 0
                            ? t("maintenance.daysLeft", {
                                count: contract.days_to_end,
                              })
                            : t("maintenance.daysOverdue", {
                                count: Math.abs(contract.days_to_end),
                              })}
                        </p>
                        <PercentageBar
                          start={contract.start_date}
                          end={contract.end_date}
                          today={businessToday()}
                          label={(percent) =>
                            t("maintenance.remainingPercent", { count: percent })
                          }
                        />
                      </td>
                      <td className={TABLE_CELL}>
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            CONTRACT_BADGES[contract.effective_status]
                          }`}
                        >
                          {contractStatusLabel(contract.effective_status, t)}
                        </span>
                        {contract.email_count > 0 && (
                          <p className="mt-1 text-[10px] text-slate-400">
                            {contract.email_count} email
                          </p>
                        )}
                      </td>
                      <td className={TABLE_CELL}>
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            disabled={contract.status === "TERMINATED"}
                            title={t("common.edit")}
                            aria-label={t("common.edit")}
                            onClick={() =>
                              setDialog({ kind: "contract", mode: "edit", contract })
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-surface-muted hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            title={t("customers.action.renew")}
                            aria-label={t("customers.action.renew")}
                            onClick={() =>
                              setDialog({ kind: "contract", mode: "renew", contract })
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 text-emerald-600 transition-colors hover:bg-emerald-50"
                          >
                            <Repeat2 size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={contract.status === "TERMINATED"}
                            title={t("customers.action.terminate")}
                            aria-label={t("customers.action.terminate")}
                            onClick={() => setDialog({ kind: "terminate", contract })}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 text-amber-600 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Ban size={14} />
                          </button>
                          <button
                            type="button"
                            title={t("customers.action.logEmail")}
                            aria-label={t("customers.action.logEmail")}
                            onClick={() =>
                              setDialog({
                                kind: "email",
                                customerId: contract.customer_id,
                                contractId: contract.id,
                              })
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-surface-muted hover:text-slate-800"
                          >
                            <Mail size={14} />
                          </button>
                          <button
                            type="button"
                            title={t("common.delete")}
                            aria-label={t("common.delete")}
                            onClick={() =>
                              setDialog({ kind: "delete-contract", contract })
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
          )}
        </div>

      ) : tab === "emails" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <select
              value={emailDirection}
              onChange={(event) =>
                setEmailDirection(event.target.value as "" | EmailDirection)
              }
              aria-label={t("customers.column.direction")}
              className={INPUT_CLASS}
            >
              <option value="">{t("common.allStatuses")}</option>
              {EMAIL_DIRECTIONS.map((direction) => (
                <option key={direction} value={direction}>
                  {emailDirectionLabel(direction, t)}
                </option>
              ))}
            </select>

            <select
              value={emailCustomerId}
              onChange={(event) => setEmailCustomerId(event.target.value)}
              aria-label={t("customers.column.customer")}
              className={INPUT_CLASS}
            >
              <option value="">
                {t("common.all")} — {t("customers.column.customer")}
              </option>
              {data.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.company_name}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={data.customers.length === 0}
              onClick={() => setDialog({ kind: "email" })}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Mail size={14} aria-hidden="true" />
              {t("customers.logEmail")}
            </button>
          </div>

          {data.emails.length === 0 ? (
            <EmptyState
              title={t("customers.empty.emails")}
              hint={t("customers.empty.emailsHint")}
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-surface">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b border-slate-200/80 bg-surface-muted">
                  <tr>
                    <th className={TABLE_HEAD}>{t("customers.column.emailDate")}</th>
                    <th className={TABLE_HEAD}>{t("customers.column.direction")}</th>
                    <th className={TABLE_HEAD}>{t("customers.column.subject")}</th>
                    <th className={TABLE_HEAD}>{t("customers.column.customer")}</th>
                    <th className={TABLE_HEAD}>{t("customers.column.counterpart")}</th>
                    <th className={TABLE_HEAD}>{t("customers.column.contract")}</th>
                    <th className={TABLE_HEAD}>{t("customers.column.open")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.emails.map((email) => {
                    const customer = customerById.get(email.customer_id);
                    const contract = email.contract_id
                      ? contractById.get(email.contract_id)
                      : null;

                    return (
                      <tr
                        key={email.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-surface-muted/60"
                      >
                        <td className={`${TABLE_CELL} whitespace-nowrap text-[11px]`}>
                          {formatDateTime(email.sent_at, locale)}
                        </td>
                        <td className={`${TABLE_CELL} whitespace-nowrap text-xs`}>
                          {emailDirectionLabel(email.direction, t)}
                        </td>
                        <td className={TABLE_CELL}>
                          <p className="max-w-xs truncate text-xs font-medium text-slate-800">
                            {email.subject}
                          </p>
                          {email.snippet && (
                            <p className="max-w-xs truncate text-[11px] text-slate-500">
                              {email.snippet}
                            </p>
                          )}
                        </td>
                        <td className={TABLE_CELL}>
                          <p className="text-xs">{customer?.company_name ?? "—"}</p>
                          {customer && (
                            <a
                              href={gmailSearchUrl(customer.contact_email)}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-[11px] text-primary hover:underline"
                            >
                              {t("customers.action.searchGmail")}
                            </a>
                          )}
                        </td>
                        <td className={TABLE_CELL}>
                          <p className="text-xs">{email.counterpart_name ?? "—"}</p>
                          <a
                            href={`mailto:${email.counterpart_email}`}
                            className="text-[11px] text-primary hover:underline"
                          >
                            {email.counterpart_email}
                          </a>
                        </td>
                        <td className={`${TABLE_CELL} whitespace-nowrap text-xs`}>
                          {contract?.contract_no ?? "—"}
                        </td>
                        <td className={TABLE_CELL}>
                          <div className="flex flex-wrap gap-1">
                            {email.gmail_thread_url && (
                              <a
                                href={email.gmail_thread_url}
                                target="_blank"
                                rel="noreferrer noopener"
                                title={t("customers.action.openGmail")}
                                aria-label={t("customers.action.openGmail")}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-surface-muted hover:text-slate-800"
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}
                            <button
                              type="button"
                              title={t("common.delete")}
                              aria-label={t("common.delete")}
                              onClick={async () => {
                                const response = await fetch(
                                  `/api/emails/${email.id}`,
                                  { method: "DELETE" },
                                );

                                if (!response.ok) {
                                  setPageError(
                                    errorMessageFor(
                                      response.status,
                                      (await response
                                        .json()
                                        .catch(() => null)) as ServerErrorBody,
                                      t,
                                    ),
                                  );
                                  return;
                                }

                                reload("customers.notice.emailDeleted");
                              }}
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
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <select
              value={leadStatusFilter}
              onChange={(event) =>
                setLeadStatusFilter(event.target.value as "" | LeadStatus)
              }
              aria-label={t("customers.form.leadStatus")}
              className={INPUT_CLASS}
            >
              <option value="">{t("common.allStatuses")}</option>
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {leadStatusLabel(status, t)}
                </option>
              ))}
            </select>
          </div>

          {data.leads.length === 0 ? (
            <EmptyState
              title={t("customers.empty.leads")}
              hint={t("customers.empty.leadsHint")}
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-surface">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="border-b border-slate-200/80 bg-surface-muted">
                  <tr>
                    <th className={TABLE_HEAD}>{t("customers.column.received")}</th>
                    <th className={TABLE_HEAD}>{t("customers.column.company")}</th>
                    <th className={TABLE_HEAD}>{t("customers.column.headcount")}</th>
                    <th className={TABLE_HEAD}>{t("customers.column.planInterest")}</th>
                    <th className={TABLE_HEAD}>{t("customers.column.message")}</th>
                    <th className={TABLE_HEAD}>{t("customers.form.leadStatus")}</th>
                    <th className={TABLE_HEAD}>{t("customers.column.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leads.map((lead) => (
                    <tr
                      key={lead.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-surface-muted/60"
                    >
                      <td className={`${TABLE_CELL} whitespace-nowrap text-[11px]`}>
                        {formatDateTime(lead.received_at, locale)}
                      </td>
                      <td className={TABLE_CELL}>
                        <p className="text-xs font-semibold text-slate-900">
                          {lead.company_name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {lead.contact_name ?? "—"}
                        </p>
                        <a
                          href={`mailto:${lead.contact_email}`}
                          className="text-[11px] text-primary hover:underline"
                        >
                          {lead.contact_email}
                        </a>
                      </td>
                      <td className={TABLE_CELL}>{lead.employee_count ?? "—"}</td>
                      <td className={`${TABLE_CELL} whitespace-nowrap text-xs`}>
                        {lead.plan_interest ?? "—"}
                      </td>
                      <td className={TABLE_CELL}>
                        <p className="max-w-xs truncate text-[11px] text-slate-600">
                          {lead.message ?? "—"}
                        </p>
                      </td>
                      <td className={TABLE_CELL}>
                        <select
                          value={lead.status}
                          onChange={(event) =>
                            changeLeadStatus(
                              lead,
                              event.target.value as LeadStatus,
                            )
                          }
                          aria-label={t("customers.action.changeLeadStatus")}
                          className={INPUT_CLASS}
                        >
                          {LEAD_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {leadStatusLabel(status, t)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={TABLE_CELL}>
                        <button
                          type="button"
                          title={t("common.delete")}
                          aria-label={t("common.delete")}
                          onClick={() =>
                            setDialog({ kind: "delete-lead", lead })
                          }
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 text-rose-600 transition-colors hover:bg-rose-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}


      {dialog?.kind === "lead" && (
        <LeadDialog onClose={closeDialog} onSaved={handleLeadSaved} />
      )}

      {dialog?.kind === "customer" && (
        <CustomerDialog
          customer={dialog.customer}
          onClose={closeDialog}
          onSaved={handleCustomerSaved}
        />
      )}

      {dialog?.kind === "contract" && (
        <ContractDialog
          mode={dialog.mode}
          contract={dialog.contract}
          customers={data.customers}
          initialCustomerId={dialog.contract?.customer_id}
          onClose={closeDialog}
          onSaved={handleContractSaved}
        />
      )}

      {dialog?.kind === "email" && data.customers.length > 0 && (
        <EmailLogDialog
          customers={data.customers}
          contracts={data.contracts}
          initialCustomerId={dialog.customerId}
          initialContractId={dialog.contractId}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog();
            reload("customers.notice.emailLogged");
          }}
        />
      )}

      {dialog?.kind === "terminate" && (
        <TerminateContractDialog
          contract={dialog.contract}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog();
            reload("customers.notice.contractTerminated");
          }}
        />
      )}

      {(dialog?.kind === "delete-customer" ||
        dialog?.kind === "delete-contract" ||
        dialog?.kind === "delete-lead") && (
        <ConfirmDialog
          title={t(
            dialog.kind === "delete-customer"
              ? "customers.confirm.customerTitle"
              : dialog.kind === "delete-contract"
                ? "customers.confirm.contractTitle"
                : "customers.confirm.leadTitle",
          )}
          description={t(
            dialog.kind === "delete-customer"
              ? "customers.confirm.customerNote"
              : dialog.kind === "delete-contract"
                ? "customers.confirm.contractNote"
                : "customers.confirm.leadNote",
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


