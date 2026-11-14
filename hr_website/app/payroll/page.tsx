"use client";

import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Loader2,
  Plus,
  Receipt,
  RefreshCw,
  Trash2,
  TriangleAlert,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useLocale } from "@/components/LocaleProvider";
import PayRateDialog, {
  type PayRateSavedEvent,
  type PayRateTarget,
} from "@/components/PayRateDialog";
import { useProfile } from "@/components/ProfileProvider";
import type { PayEstimate } from "@/lib/domain/entities/PayEstimate";
import type { PayProfile } from "@/lib/domain/entities/PayProfile";
import type { PayslipDetail } from "@/lib/domain/entities/PayslipDetail";
import {
  PAYSLIP_ITEM_CODE_PRESETS,
  type PayslipItemKind,
} from "@/lib/domain/entities/PayslipItem";
import {
  PAYSLIP_NET_MAX,
  type Payslip,
  type PayslipStatus,
} from "@/lib/domain/entities/Payslip";
import {
  formatCurrency,
  formatDate,
  formatDayMonth,
  formatNumber,
} from "@/lib/i18n/format";
import { errorMessageFor, type ServerErrorBody } from "@/lib/i18n/serverMessages";
import type {
  MessageKey,
  Translate,
  TranslationParams,
} from "@/lib/i18n/translate";
import {
  businessMonth,
  payrollMonthLabel,
  shiftPayrollMonth,
} from "@/lib/usecases/payrollPeriod";

/** The SCRUM-24 directory row this screen needs: a name, a role and the branch the payslip is filed under. */
type StaffMember = {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
  branch_id: string | null;
};

type BranchOption = { id: string; name: string };

/** Everything one month needs, fetched together so the table, the KPIs and the estimate describe the same rows. */
type PayrollData = {
  month: string;
  payslips: Payslip[];
  profiles: PayProfile[];
  estimate: PayEstimate | null;
  staff: StaffMember[];
  branches: BranchOption[];
};

/** A failed request, kept as status + server sentence so `errorMessageFor` can translate it at render time. */
type RequestFailure = { status: number; message?: string };

type Notice = { key: MessageKey; params?: TranslationParams };

type ItemDraft = {
  kind: PayslipItemKind;
  code: string;
  label: string;
  amount: string;
};

const STATUS_BADGES: Record<PayslipStatus, string> = {
  DRAFT: "border-amber-200 bg-amber-50 text-amber-700",
  PUBLISHED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  VOID: "border-slate-200 bg-slate-100 text-slate-600",
};

const STATUS_KEYS: Record<PayslipStatus, MessageKey> = {
  DRAFT: "payroll.status.DRAFT",
  PUBLISHED: "payroll.status.PUBLISHED",
  VOID: "payroll.status.VOID",
};

function payslipStatusLabel(status: PayslipStatus, t: Translate): string {
  return t(STATUS_KEYS[status]);
}

/** `minutes` as the hours a reader expects, one decimal at most (`4,5 giờ`) — the API speaks minutes. */
function hoursValue(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

async function failureOf(response: Response): Promise<RequestFailure> {
  const body = (await response.json().catch(() => null)) as ServerErrorBody;

  return {
    status: response.status,
    message: typeof body?.error === "string" ? body.error : undefined,
  };
}

const EMPTY_ITEM: ItemDraft = {
  kind: "EARNING",
  code: "BONUS",
  label: "",
  amount: "",
};

/**
 * Bảng lương (SCRUM-90): the month's hours, priced.
 *
 * Two audiences share one screen, and the difference is data rather than buttons: the owner sees every
 * payslip of the organization plus the rates tab and the generate/publish/void actions; an employee or a
 * manager sees only their own PUBLISHED payslip (RLS) and their own mid-month estimate. Everything else
 * is derived from what `/api/payroll/*` returned, so nothing here can promise a number the API would not
 * serve.
 */
export default function PayrollPage() {
  const { profile, can } = useProfile();
  const { locale, t } = useLocale();

  const managesPayroll = can("payroll:manage");
  const readsDirectory = can("directory:view");

  const [month, setMonth] = useState(() => businessMonth());
  const [reloadToken, setReloadToken] = useState(0);
  const [data, setData] = useState<PayrollData | null>(null);
  const [loadFailure, setLoadFailure] = useState<RequestFailure | null>(null);
  const [actionFailure, setActionFailure] = useState<RequestFailure | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState<"payslips" | "rates">("payslips");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PayslipDetail | null>(null);
  const [rateTarget, setRateTarget] = useState<PayRateTarget | null>(null);
  const [itemDraft, setItemDraft] = useState<ItemDraft>(EMPTY_ITEM);
  const [voidReason, setVoidReason] = useState("");
  const [disputeNote, setDisputeNote] = useState("");
  /** SCRUM-93: what the owner typed into "Lương thực nhận"; seeded from the payslip's current net. */
  const [netDraft, setNetDraft] = useState("");

  /**
   * One request per thing the month needs, all at once so the table, the KPIs and the estimate describe the
   * same rows. `setState` only happens in the promise callbacks: React 19's `set-state-in-effect` rule fails
   * a synchronous `setState` in the effect body (the same reason `components/Sidebar.tsx` loads this way).
   */
  useEffect(() => {
    let cancelled = false;

    const request = (path: string): Promise<Response | null> =>
      fetch(path).catch(() => null);

    Promise.all([
      request(`/api/payroll/payslips?month=${month}`),
      request("/api/payroll/profiles"),
      request(`/api/payroll/estimate?month=${month}`),
      readsDirectory ? request("/api/users") : Promise.resolve(null),
      readsDirectory ? request("/api/branches") : Promise.resolve(null),
    ])
      .then(
        async ([
          payslipsResponse,
          profilesResponse,
          estimateResponse,
          staffResponse,
          branchResponse,
        ]) => {
          // The payslip list IS the screen: without it there is nothing honest to render, while a missing
          // directory or rate list only leaves a name or a rate blank.
          if (!payslipsResponse?.ok) {
            const failure = payslipsResponse
              ? await failureOf(payslipsResponse)
              : { status: 500 };

            if (!cancelled) {
              setLoadFailure(failure);
              setData(null);
            }

            return;
          }

          const payslips = (await payslipsResponse.json()) as Payslip[];
          const profiles = profilesResponse?.ok
            ? ((await profilesResponse.json()) as PayProfile[])
            : [];
          const estimate = estimateResponse?.ok
            ? ((await estimateResponse.json()) as PayEstimate)
            : null;
          const staff = staffResponse?.ok
            ? ((await staffResponse.json()) as StaffMember[])
            : [];
          const branches = branchResponse?.ok
            ? ((await branchResponse.json()) as BranchOption[])
            : [];

          if (cancelled) {
            return;
          }

          setLoadFailure(null);
          setData({ month, payslips, profiles, estimate, staff, branches });
        },
      )
      .catch(() => {
        if (!cancelled) {
          setLoadFailure({ status: 500 });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [month, reloadToken, readsDirectory]);

  /** Stale data from another month must not be read as this month's numbers. */
  const loading = data === null || data.month !== month;

  const viewerId = profile?.id ?? null;

  const staffById = useMemo(() => {
    const map = new Map<string, StaffMember>();

    (data?.staff ?? []).forEach((member) => map.set(member.id, member));

    return map;
  }, [data]);

  const branchNameOf = useMemo(() => {
    const map = new Map<string, string>();

    (data?.branches ?? []).forEach((branch) => map.set(branch.id, branch.name));

    return (id: string | null): string => (id ? map.get(id) ?? "—" : "—");
  }, [data]);

  /** The latest rate of each employee: `findProfiles` orders `effective_from` descending. */
  const latestRate = useMemo(() => {
    const map = new Map<string, PayProfile>();

    (data?.profiles ?? []).forEach((rate) => {
      if (!map.has(rate.employee_id)) {
        map.set(rate.employee_id, rate);
      }
    });

    return map;
  }, [data]);

  const employeeName = (id: string): string =>
    staffById.get(id)?.full_name ?? `#${id.slice(0, 8)}`;

  const published = useMemo(
    () => (data?.payslips ?? []).filter((slip) => slip.status === "PUBLISHED"),
    [data],
  );

  const totals = useMemo(
    () =>
      published.reduce(
        (sum, slip) => ({
          work: sum.work + slip.work_amount,
          deduction: sum.deduction + slip.deduction_amount,
          net: sum.net + slip.net_amount,
        }),
        { work: 0, deduction: 0, net: 0 },
      ),
    [published],
  );

  const draftCount = (data?.payslips ?? []).filter(
    (slip) => slip.status === "DRAFT",
  ).length;

  /** Employees the generator skips: "no rate effective in this month" is exactly why a payslip is missing. */
  const missingRates = useMemo(
    () =>
      (data?.staff ?? []).filter(
        (member) =>
          managesPayroll &&
          member.role !== "OWNER" &&
          member.is_active &&
          !latestRate.has(member.id),
      ),
    [data, latestRate, managesPayroll],
  );

  const rateRows = useMemo(
    () =>
      (data?.staff ?? [])
        .filter(
          (member) =>
            member.role !== "OWNER" &&
            (member.is_active || latestRate.has(member.id)),
        )
        .map((member) => ({ member, rate: latestRate.get(member.id) ?? null })),
    [data, latestRate],
  );

  const refresh = () => setReloadToken((token) => token + 1);

  const resetMessages = () => {
    setActionFailure(null);
    setNotices([]);
  };

  async function handleGenerate() {
    setBusy(true);
    resetMessages();

    try {
      const response = await fetch("/api/payroll/payslips/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });

      if (!response.ok) {
        setActionFailure(await failureOf(response));
        return;
      }

      const body = (await response.json()) as { drafts?: number };
      const drafts = Number(body.drafts ?? 0);

      setNotices([
        drafts > 0
          ? { key: "payroll.notice.generated", params: { count: drafts } }
          : { key: "payroll.notice.generatedNone" },
      ]);
      refresh();
    } catch {
      setActionFailure({ status: 500 });
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish() {
    setBusy(true);
    resetMessages();

    try {
      const response = await fetch("/api/payroll/payslips/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });

      if (!response.ok) {
        setActionFailure(await failureOf(response));
        return;
      }

      const body = (await response.json()) as {
        published?: number;
        held_for_complaints?: number;
      };
      const count = Number(body.published ?? 0);
      const held = Number(body.held_for_complaints ?? 0);
      const next: Notice[] = [
        count > 0
          ? { key: "payroll.notice.published", params: { count } }
          : { key: "payroll.notice.publishedNone" },
      ];

      if (held > 0) {
        next.push({ key: "payroll.notice.held", params: { count: held } });
      }

      setNotices(next);
      refresh();
    } catch {
      setActionFailure({ status: 500 });
    } finally {
      setBusy(false);
    }
  }

  async function loadDetail(id: string) {
    try {
      const response = await fetch(`/api/payroll/payslips/${id}`);

      if (!response.ok) {
        setActionFailure(await failureOf(response));
        return;
      }

      const loaded = (await response.json()) as PayslipDetail;

      setDetail(loaded);
      // The field starts at the figure the payslip carries, so "chốt" without editing changes nothing.
      setNetDraft(String(loaded.payslip.net_amount));
    } catch {
      setActionFailure({ status: 500 });
    }
  }

  function openDetail(id: string) {
    resetMessages();
    setDetailId(id);
    setDetail(null);
    setItemDraft(EMPTY_ITEM);
    setVoidReason("");
    setDisputeNote("");
    setNetDraft("");
    void loadDetail(id);
  }

  function closeDetail() {
    setDetailId(null);
    setDetail(null);
    setItemDraft(EMPTY_ITEM);
    setVoidReason("");
    setDisputeNote("");
    setNetDraft("");
  }

  /**
   * SCRUM-92: the rate dialog is shared with `/staff`, so the page only says *whose* rates to show. It opens
   * on the history when the employee already has a rate and on the form when they have none — which is the
   * one thing the old in-page modal could not do.
   */
  function openRates(member: StaffMember) {
    resetMessages();
    setRateTarget({ employeeId: member.id, fullName: member.full_name });
  }

  function handleRateSaved(event: PayRateSavedEvent) {
    setNotices([
      {
        key:
          event === "created"
            ? "payroll.notice.rateSaved"
            : event === "updated"
              ? "payroll.notice.rateUpdated"
              : "payroll.notice.rateRemoved",
      },
    ]);
    refresh();
  }

  /**
   * Chốt lương thực nhận (SCRUM-93): the owner types the exact figure, the endpoint stores the difference as
   * one ADJUSTMENT item and recalculates. Reloading the detail is what shows that item to the reader.
   */
  async function handleSetNet() {
    if (!detail) {
      return;
    }

    const targetNet = Number(netDraft);

    if (
      !Number.isInteger(targetNet) ||
      targetNet < 0 ||
      targetNet > PAYSLIP_NET_MAX
    ) {
      setActionFailure({ status: 400, message: t("payroll.final.invalid") });
      return;
    }

    setBusy(true);
    resetMessages();

    try {
      const response = await fetch(
        `/api/payroll/payslips/${detail.payslip.id}/net`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetNet, note: null }),
        },
      );

      if (!response.ok) {
        setActionFailure(await failureOf(response));
        return;
      }

      setNotices([{ key: "payroll.final.saved" }]);
      await loadDetail(detail.payslip.id);
      refresh();
    } catch {
      setActionFailure({ status: 500 });
    } finally {
      setBusy(false);
    }
  }

  async function handleAddItem() {
    if (!detail) {
      return;
    }

    const amount = Number(itemDraft.amount);

    if (!itemDraft.label.trim()) {
      setActionFailure({ status: 400, message: t("payroll.error.itemLabel") });
      return;
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      setActionFailure({ status: 400, message: t("payroll.error.itemAmount") });
      return;
    }

    setBusy(true);
    resetMessages();

    try {
      const response = await fetch(
        `/api/payroll/payslips/${detail.payslip.id}/items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: itemDraft.kind,
            code: itemDraft.code,
            label: itemDraft.label.trim(),
            amount,
          }),
        },
      );

      if (!response.ok) {
        setActionFailure(await failureOf(response));
        return;
      }

      setItemDraft(EMPTY_ITEM);
      setNotices([{ key: "payroll.notice.itemAdded" }]);
      await loadDetail(detail.payslip.id);
      refresh();
    } catch {
      setActionFailure({ status: 500 });
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveItem(itemId: string) {
    if (!detail) {
      return;
    }

    setBusy(true);
    resetMessages();

    try {
      const response = await fetch(
        `/api/payroll/payslips/${detail.payslip.id}/items/${itemId}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        setActionFailure(await failureOf(response));
        return;
      }

      setNotices([{ key: "payroll.notice.itemRemoved" }]);
      await loadDetail(detail.payslip.id);
      refresh();
    } catch {
      setActionFailure({ status: 500 });
    } finally {
      setBusy(false);
    }
  }

  async function handleVoid() {
    if (!detail) {
      return;
    }

    if (voidReason.trim().length < 5) {
      setActionFailure({ status: 400, message: t("payroll.error.voidReason") });
      return;
    }

    setBusy(true);
    resetMessages();

    try {
      const response = await fetch(
        `/api/payroll/payslips/${detail.payslip.id}/void`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: voidReason.trim() }),
        },
      );

      if (!response.ok) {
        setActionFailure(await failureOf(response));
        return;
      }

      setVoidReason("");
      setNotices([{ key: "payroll.notice.voided" }]);
      await loadDetail(detail.payslip.id);
      refresh();
    } catch {
      setActionFailure({ status: 500 });
    } finally {
      setBusy(false);
    }
  }

  async function handleResolveDispute() {
    if (!detail) {
      return;
    }

    setBusy(true);
    resetMessages();

    try {
      const response = await fetch(
        `/api/payroll/payslips/${detail.payslip.id}/resolve-dispute`,
        { method: "POST" },
      );

      if (!response.ok) {
        setActionFailure(await failureOf(response));
        return;
      }

      setNotices([{ key: "payroll.notice.resolved" }]);
      await loadDetail(detail.payslip.id);
      refresh();
    } catch {
      setActionFailure({ status: 500 });
    } finally {
      setBusy(false);
    }
  }

  async function handleAcknowledge() {
    if (!detail) {
      return;
    }

    setBusy(true);
    resetMessages();

    try {
      const response = await fetch(
        `/api/payroll/payslips/${detail.payslip.id}/acknowledge`,
        { method: "POST" },
      );

      if (!response.ok) {
        setActionFailure(await failureOf(response));
        return;
      }

      setNotices([{ key: "payroll.notice.acknowledged" }]);
      await loadDetail(detail.payslip.id);
      refresh();
    } catch {
      setActionFailure({ status: 500 });
    } finally {
      setBusy(false);
    }
  }

  async function handleDispute() {
    if (!detail) {
      return;
    }

    if (disputeNote.trim().length < 5) {
      setActionFailure({
        status: 400,
        message: t("payroll.error.disputeNote"),
      });
      return;
    }

    setBusy(true);
    resetMessages();

    try {
      const response = await fetch(
        `/api/payroll/payslips/${detail.payslip.id}/dispute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: disputeNote.trim() }),
        },
      );

      if (!response.ok) {
        setActionFailure(await failureOf(response));
        return;
      }

      setDisputeNote("");
      setNotices([{ key: "payroll.notice.disputed" }]);
      await loadDetail(detail.payslip.id);
      refresh();
    } catch {
      setActionFailure({ status: 500 });
    } finally {
      setBusy(false);
    }
  }

  const detailPayslip = detail?.payslip ?? null;
  const isOwnPayslip = detailPayslip?.employee_id === viewerId;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            {t("payroll.eyebrow")}
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">
            {t("payroll.heading")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {t("payroll.subtitle")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-surface p-1">
            <button
              type="button"
              aria-label={t("payroll.month.prev")}
              onClick={() => setMonth(shiftPayrollMonth(month, -1))}
              className="rounded-lg p-2 text-slate-500 hover:bg-surface-muted hover:text-slate-900"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="month"
              aria-label={t("payroll.month.pick")}
              value={month}
              onChange={(event) => {
                if (event.target.value) {
                  setMonth(event.target.value);
                }
              }}
              className="rounded-md border-0 bg-transparent px-1 text-sm font-medium text-slate-800 focus:outline-none"
            />
            <button
              type="button"
              aria-label={t("payroll.month.next")}
              onClick={() => setMonth(shiftPayrollMonth(month, 1))}
              className="rounded-lg p-2 text-slate-500 hover:bg-surface-muted hover:text-slate-900"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-surface px-3 py-2 text-sm font-medium text-slate-600 hover:bg-surface-muted"
          >
            <RefreshCw className="h-4 w-4" />
            {t("payroll.refresh")}
          </button>

          {managesPayroll && (
            <>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-blue-50 px-3 py-2 text-sm font-medium text-primary hover:bg-blue-100 disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Receipt className="h-4 w-4" />
                )}
                {t("payroll.action.generate")}
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={busy || draftCount === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-strong disabled:opacity-60"
              >
                <Wallet className="h-4 w-4" />
                {t("payroll.action.publish")}
              </button>
            </>
          )}
        </div>
      </header>

      {loadFailure && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {errorMessageFor(
              loadFailure.status,
              { error: loadFailure.message },
              t,
            )}
          </span>
        </div>
      )}

      {actionFailure && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {errorMessageFor(
              actionFailure.status,
              { error: actionFailure.message },
              t,
            )}
          </span>
        </div>
      )}

      {notices.length > 0 && (
        <div className="flex flex-col gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notices.map((notice) => (
            <p key={notice.key}>{t(notice.key, notice.params)}</p>
          ))}
        </div>
      )}

      {data?.estimate && (
        <section className="rounded-2xl border border-slate-200/80 bg-surface px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                {t("payroll.estimate.title", {
                  month: payrollMonthLabel(month),
                })}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {t("payroll.estimate.subtitle")}
              </p>
            </div>
            {data.estimate.has_pay_profile ? (
              <p className="text-xl font-semibold text-primary">
                {formatCurrency(data.estimate.gross_estimate, locale)}
              </p>
            ) : (
              <p className="max-w-md text-sm text-amber-700">
                {t("payroll.estimate.noProfile")}
              </p>
            )}
          </div>
          {data.estimate.has_pay_profile && (
            <p className="mt-2 text-xs text-slate-500">
              {t("payroll.estimate.shifts", {
                counted: data.estimate.shifts_counted,
                skipped: data.estimate.shifts_skipped,
              })}
            </p>
          )}
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={Clock3}
          label={t("payroll.kpi.work")}
          value={formatCurrency(totals.work, locale)}
          hint={t("payroll.kpi.publishedOnly")}
        />
        <Metric
          icon={CircleDollarSign}
          label={t("payroll.kpi.deduction")}
          value={formatCurrency(totals.deduction, locale)}
        />
        <Metric
          icon={Wallet}
          label={t("payroll.kpi.net")}
          value={formatCurrency(totals.net, locale)}
        />
        <Metric
          icon={Receipt}
          label={t("payroll.kpi.count")}
          value={formatNumber((data?.payslips ?? []).length, locale)}
          hint={t("payroll.kpi.countHint", {
            draft: draftCount,
            published: published.length,
          })}
        />
      </section>

      {managesPayroll && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("payslips")}
            className={`rounded-xl px-3 py-2 text-sm font-medium ${
              tab === "payslips"
                ? "bg-primary text-white"
                : "border border-slate-200/80 bg-surface text-slate-600 hover:bg-surface-muted"
            }`}
          >
            {t("payroll.tab.payslips")}
          </button>
          <button
            type="button"
            onClick={() => setTab("rates")}
            className={`rounded-xl px-3 py-2 text-sm font-medium ${
              tab === "rates"
                ? "bg-primary text-white"
                : "border border-slate-200/80 bg-surface text-slate-600 hover:bg-surface-muted"
            }`}
          >
            {t("payroll.tab.rates")}
          </button>
        </div>
      )}

      {tab === "payslips" || !managesPayroll ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {t("payroll.tab.payslips")} · {payrollMonthLabel(month)}
            </h2>
            <span className="text-xs text-slate-500">
              {t("payroll.kpi.countHint", {
                draft: draftCount,
                published: published.length,
              })}
            </span>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 px-4 py-10 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("payroll.loading")}
            </div>
          ) : (data?.payslips ?? []).length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Banknote className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-700">
                {t("payroll.empty.payslips")}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {managesPayroll
                  ? t("payroll.empty.payslipsOwner")
                  : t("payroll.empty.payslipsEmployee")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t("payroll.table.employee")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t("payroll.table.branch")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                      {t("payroll.table.regularHours")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                      {t("payroll.table.overtimeHours")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                      {t("payroll.table.workAmount")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                      {t("payroll.table.gross")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                      {t("payroll.table.deduction")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                      {t("payroll.table.net")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t("payroll.table.status")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                      {t("payroll.table.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.payslips ?? []).map((slip) => (
                    <tr key={slip.id} className="hover:bg-surface-muted/60">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {employeeName(slip.employee_id)}
                        </p>
                        {slip.shifts_skipped > 0 && (
                          <p className="text-xs text-amber-700">
                            {t("payroll.table.skipped", {
                              count: slip.shifts_skipped,
                            })}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {branchNameOf(slip.branch_id)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                        {t("payroll.hoursValue", {
                          hours: formatNumber(
                            hoursValue(slip.regular_minutes),
                            locale,
                          ),
                        })}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                        {t("payroll.hoursValue", {
                          hours: formatNumber(
                            hoursValue(slip.overtime_minutes),
                            locale,
                          ),
                        })}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                        {formatCurrency(slip.work_amount, locale)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                        {formatCurrency(slip.gross_amount, locale)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                        {formatCurrency(slip.deduction_amount, locale)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
                        {formatCurrency(slip.net_amount, locale)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_BADGES[slip.status]}`}
                          >
                            {payslipStatusLabel(slip.status, t)}
                          </span>
                          {slip.disputed_at && !slip.dispute_resolved_at && (
                            <span className="whitespace-nowrap text-xs font-medium text-rose-600">
                              {t("payroll.status.disputed")}
                            </span>
                          )}
                          {slip.acknowledged_at && (
                            <span className="whitespace-nowrap text-xs text-emerald-600">
                              {t("payroll.status.acknowledged")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openDetail(slip.id)}
                          className="min-h-10 whitespace-nowrap rounded-lg border border-slate-200/80 px-3 text-xs font-medium text-slate-600 hover:bg-surface-muted"
                        >
                          {t("payroll.table.detail")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "rates" && managesPayroll && (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-surface">
          <div className="border-b border-slate-200/80 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {t("payroll.rates.title")}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {t("payroll.rates.subtitle")}
            </p>
          </div>

          {missingRates.length > 0 && (
            <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">
                  {t("payroll.rates.missingTitle", {
                    count: missingRates.length,
                  })}
                </p>
                <p className="text-xs">{t("payroll.rates.missingNote")}</p>
                <p className="mt-1 text-xs">
                  {missingRates.map((member) => member.full_name).join(", ")}
                </p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 px-4 py-10 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("payroll.loading")}
            </div>
          ) : rateRows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              {t("payroll.rates.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t("payroll.rates.employee")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                      {t("payroll.rates.hourly")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                      {t("payroll.rates.multiplier")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                      {t("payroll.rates.allowance")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t("payroll.rates.effectiveFrom")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                      {t("payroll.table.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rateRows.map(({ member, rate }) => (
                    <tr key={member.id} className="hover:bg-surface-muted/60">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {member.full_name}
                        </p>
                        {!rate && (
                          <p className="text-xs text-amber-700">
                            {t("payroll.rates.missingRow")}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                        {rate ? formatCurrency(rate.hourly_rate, locale) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                        {rate ? `×${formatNumber(rate.overtime_multiplier, locale)}` : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                        {rate ? formatCurrency(rate.fixed_allowance, locale) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {rate ? formatDate(rate.effective_from, locale) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openRates(member)}
                          className="min-h-10 whitespace-nowrap rounded-lg border border-slate-200/80 px-3 text-xs font-medium text-slate-600 hover:bg-surface-muted"
                        >
                          {rate ? t("payroll.rates.edit") : t("payroll.rates.add")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {rateTarget && (
        <PayRateDialog
          target={rateTarget}
          profiles={(data?.profiles ?? []).filter(
            (profile) => profile.employee_id === rateTarget.employeeId,
          )}
          onClose={() => setRateTarget(null)}
          onSaved={handleRateSaved}
        />
      )}

      {detailId && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("payroll.detail.title")}
            className="flex max-h-[85dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-surface shadow-xl"
          >
            <header className="flex items-start justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {detailPayslip
                    ? employeeName(detailPayslip.employee_id)
                    : t("payroll.detail.title")}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {t("payroll.detail.period", {
                    from: formatDate(detailPayslip?.period_start, locale),
                    to: formatDate(detailPayslip?.period_end, locale),
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                aria-label={t("payroll.detail.close")}
                className="rounded-lg p-2 text-slate-500 hover:bg-surface-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {detailPayslip ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_BADGES[detailPayslip.status]}`}
                    >
                      {payslipStatusLabel(detailPayslip.status, t)}
                    </span>
                    <span className="text-xs text-slate-500">
                      {t("payroll.table.regularHours")}:{" "}
                      {t("payroll.hoursValue", {
                        hours: formatNumber(
                          hoursValue(detailPayslip.regular_minutes),
                          locale,
                        ),
                      })}
                    </span>
                    <span className="text-xs text-slate-500">
                      {t("payroll.table.overtimeHours")}:{" "}
                      {t("payroll.hoursValue", {
                        hours: formatNumber(
                          hoursValue(detailPayslip.overtime_minutes),
                          locale,
                        ),
                      })}
                    </span>
                    {detailPayslip.shifts_skipped > 0 && (
                      <span className="text-xs font-medium text-amber-700">
                        {t("payroll.table.skipped", {
                          count: detailPayslip.shifts_skipped,
                        })}
                      </span>
                    )}
                  </div>

                  {detailPayslip.void_reason && (
                    <p className="rounded-xl border border-slate-200/80 bg-surface-muted px-3 py-2 text-xs text-slate-600">
                      {t("payroll.detail.voidedReason", {
                        reason: detailPayslip.void_reason,
                      })}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Summary
                      label={t("payroll.table.workAmount")}
                      value={formatCurrency(detailPayslip.work_amount, locale)}
                    />
                    <Summary
                      label={t("payroll.table.allowance")}
                      value={formatCurrency(detailPayslip.other_earnings, locale)}
                    />
                    <Summary
                      label={t("payroll.table.deduction")}
                      value={formatCurrency(detailPayslip.deduction_amount, locale)}
                    />
                    <Summary
                      label={t("payroll.table.net")}
                      value={formatCurrency(detailPayslip.net_amount, locale)}
                      emphasis
                    />
                  </div>

                  {/*
                    SCRUM-93: the base stays the hours; this control only records the difference as one
                    ADJUSTMENT item, which is why the note under it can promise the published figure never
                    changes silently.
                  */}
                  <section className="rounded-xl border border-slate-200/80 p-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {t("payroll.final.title")}
                    </h3>
                    {detailPayslip.status === "DRAFT" ? (
                      <>
                        <p className="mt-1 text-xs text-slate-500">
                          {t("payroll.final.hint")}
                        </p>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                          <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
                            {t("payroll.final.input")}
                            <input
                              value={netDraft}
                              onChange={(event) => setNetDraft(event.target.value)}
                              inputMode="numeric"
                              className="rounded-lg border border-slate-200 bg-surface px-2 py-2 text-sm text-slate-800"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void handleSetNet()}
                            disabled={busy || netDraft.trim() === ""}
                            className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-strong disabled:opacity-60"
                          >
                            {busy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Banknote className="h-4 w-4" />
                            )}
                            {t("payroll.final.submit")}
                          </button>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          {t("payroll.final.current", {
                            amount: formatCurrency(
                              detailPayslip.net_amount,
                              locale,
                            ),
                          })}
                          {Number.isInteger(Number(netDraft)) &&
                            netDraft.trim() !== "" &&
                            Number(netDraft) !== detailPayslip.net_amount && (
                              <span className="ml-1 font-medium text-slate-700">
                                ·{" "}
                                {Number(netDraft) > detailPayslip.net_amount
                                  ? "+"
                                  : "−"}
                                {formatCurrency(
                                  Math.abs(
                                    Number(netDraft) -
                                      detailPayslip.net_amount,
                                  ),
                                  locale,
                                )}
                              </span>
                            )}
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">
                        {t("payroll.final.draftOnly")}
                      </p>
                    )}
                  </section>

                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {t("payroll.detail.workLines")}
                    </h3>
                    {detail?.work_lines.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">
                        {t("payroll.detail.workLinesEmpty")}
                      </p>
                    ) : (
                      <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200/80">
                        <table className="min-w-full text-sm">
                          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="whitespace-nowrap px-3 py-2 font-medium">
                                {t("payroll.detail.date")}
                              </th>
                              <th className="whitespace-nowrap px-3 py-2 font-medium">
                                {t("payroll.detail.shift")}
                              </th>
                              <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                                {t("payroll.detail.minutes")}
                              </th>
                              <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                                {t("payroll.detail.rate")}
                              </th>
                              <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                                {t("payroll.detail.multiplier")}
                              </th>
                              <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                                {t("payroll.detail.amount")}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(detail?.work_lines ?? []).map((line) => (
                              <tr key={line.id}>
                                <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                                  {formatDayMonth(line.work_date)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                                  {line.shift_name ?? "—"}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">
                                  {formatNumber(line.minutes, locale)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">
                                  {formatCurrency(line.hourly_rate, locale)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">
                                  {`×${formatNumber(line.multiplier, locale)}`}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-slate-900">
                                  {formatCurrency(line.amount, locale)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {t("payroll.detail.items")}
                    </h3>
                    {detail?.items.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">
                        {t("payroll.detail.itemsEmpty")}
                      </p>
                    ) : (
                      <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200/80">
                        {(detail?.items ?? []).map((item) => (
                          <li
                            key={item.id}
                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                          >
                            <div>
                              <p className="text-sm font-medium text-slate-900">
                                {item.label}
                              </p>
                              <p className="text-xs text-slate-500">
                                {item.code} ·{" "}
                                {item.source === "AUTO"
                                  ? t("payroll.detail.auto")
                                  : t("payroll.detail.manual")}
                                {item.kind === "DEDUCTION"
                                  ? ` · ${t("payroll.detail.kindDeduction")}`
                                  : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <span
                                className={`whitespace-nowrap text-sm font-semibold ${
                                  item.kind === "DEDUCTION"
                                    ? "text-rose-600"
                                    : "text-emerald-700"
                                }`}
                              >
                                {item.kind === "DEDUCTION" ? "−" : "+"}
                                {formatCurrency(item.amount, locale)}
                              </span>
                              {managesPayroll &&
                                detailPayslip.status === "DRAFT" &&
                                item.source === "MANUAL" && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveItem(item.id)}
                                    disabled={busy}
                                    aria-label={t("payroll.detail.delete")}
                                    className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    {managesPayroll && detailPayslip.status !== "DRAFT" && (
                      <p className="mt-2 text-xs text-slate-500">
                        {t("payroll.detail.draftOnly")}
                      </p>
                    )}

                    {managesPayroll && detailPayslip.status === "DRAFT" && (
                      <div className="mt-3 rounded-xl border border-slate-200/80 bg-surface-muted p-3">
                        <div className="grid gap-2 sm:grid-cols-4">
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                            {t("payroll.detail.kind")}
                            <select
                              value={itemDraft.kind}
                              onChange={(event) =>
                                setItemDraft({
                                  ...itemDraft,
                                  kind: event.target.value as PayslipItemKind,
                                })
                              }
                              className="rounded-lg border border-slate-200 bg-surface px-2 py-2 text-sm text-slate-800"
                            >
                              <option value="EARNING">
                                {t("payroll.detail.kindEarning")}
                              </option>
                              <option value="DEDUCTION">
                                {t("payroll.detail.kindDeduction")}
                              </option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                            {t("payroll.detail.code")}
                            <select
                              value={itemDraft.code}
                              onChange={(event) =>
                                setItemDraft({
                                  ...itemDraft,
                                  code: event.target.value,
                                })
                              }
                              className="rounded-lg border border-slate-200 bg-surface px-2 py-2 text-sm text-slate-800"
                            >
                              {PAYSLIP_ITEM_CODE_PRESETS.map((code) => (
                                <option key={code} value={code}>
                                  {code}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                            {t("payroll.detail.label")}
                            <input
                              value={itemDraft.label}
                              onChange={(event) =>
                                setItemDraft({
                                  ...itemDraft,
                                  label: event.target.value,
                                })
                              }
                              maxLength={80}
                              className="rounded-lg border border-slate-200 bg-surface px-2 py-2 text-sm text-slate-800"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                            {t("payroll.detail.amount")}
                            <input
                              value={itemDraft.amount}
                              onChange={(event) =>
                                setItemDraft({
                                  ...itemDraft,
                                  amount: event.target.value,
                                })
                              }
                              inputMode="numeric"
                              className="rounded-lg border border-slate-200 bg-surface px-2 py-2 text-sm text-slate-800"
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          onClick={handleAddItem}
                          disabled={busy}
                          className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-strong disabled:opacity-60"
                        >
                          <Plus className="h-4 w-4" />
                          {t("payroll.detail.addItem")}
                        </button>
                      </div>
                    )}
                  </section>

                  <section className="flex flex-col gap-3">
                    {detailPayslip.dispute_note && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        <p>
                          {t("payroll.detail.disputeOpen", {
                            note: detailPayslip.dispute_note,
                          })}
                        </p>
                        {detailPayslip.dispute_resolved_at && (
                          <p className="mt-1 font-medium text-emerald-700">
                            {t("payroll.detail.disputeResolved")}
                          </p>
                        )}
                      </div>
                    )}

                    {managesPayroll &&
                      detailPayslip.disputed_at &&
                      !detailPayslip.dispute_resolved_at && (
                        <button
                          type="button"
                          onClick={handleResolveDispute}
                          disabled={busy}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                        >
                          {t("payroll.detail.resolveDispute")}
                        </button>
                      )}

                    {managesPayroll && detailPayslip.status !== "VOID" && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                        <label className="flex flex-col gap-1 text-xs font-medium text-rose-700">
                          {t("payroll.detail.voidReason")}
                          <input
                            value={voidReason}
                            onChange={(event) => setVoidReason(event.target.value)}
                            maxLength={300}
                            className="rounded-lg border border-rose-200 bg-surface px-2 py-2 text-sm text-slate-800"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={handleVoid}
                          disabled={busy}
                          className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-300 bg-surface px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                        >
                          <X className="h-4 w-4" />
                          {t("payroll.detail.voidConfirm")}
                        </button>
                      </div>
                    )}

                    {isOwnPayslip && detailPayslip.status === "PUBLISHED" && (
                      <div className="flex flex-col gap-2 rounded-xl border border-slate-200/80 p-3">
                        <button
                          type="button"
                          onClick={handleAcknowledge}
                          disabled={busy}
                          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-strong disabled:opacity-60"
                        >
                          {t("payroll.detail.acknowledge")}
                        </button>
                        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                          {t("payroll.detail.disputeNote")}
                          <textarea
                            value={disputeNote}
                            onChange={(event) => setDisputeNote(event.target.value)}
                            rows={2}
                            maxLength={500}
                            className="rounded-lg border border-slate-200 bg-surface px-2 py-2 text-sm text-slate-800"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={handleDispute}
                          disabled={busy}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200/80 px-3 text-sm font-medium text-slate-600 hover:bg-surface-muted disabled:opacity-60"
                        >
                          <TriangleAlert className="h-4 w-4" />
                          {t("payroll.detail.dispute")}
                        </button>
                      </div>
                    )}
                  </section>
                </div>
              ) : (
                <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("payroll.loading")}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** One KPI card: a label, the number that matters and an optional hint under it. */
function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-surface px-4 py-3">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-[0.14em]">
          {label}
        </span>
      </div>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** One figure of the payslip drawer (lương ca, phụ cấp, khấu trừ, thực nhận). */
function Summary({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-surface-muted px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`mt-0.5 text-sm font-semibold ${
          emphasis ? "text-primary" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
