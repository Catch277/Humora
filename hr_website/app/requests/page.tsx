"use client";

import {
  CalendarDays,
  Check,
  Clock3,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useLocale } from "@/components/LocaleProvider";
import { useProfile } from "@/components/ProfileProvider";
import { canManageBranch, defaultBranchId } from "@/lib/domain/branchScope";
import {
  MAX_REQUEST_CONTENT_LENGTH,
  MAX_REQUEST_TITLE_LENGTH,
  REQUEST_TYPES,
  requestNeedsSwapDetails,
  requestNeedsWorkDate,
  type RequestType,
} from "@/lib/domain/entities/RequestEntity";
import { isManagerRole } from "@/lib/domain/roles";
import {
  formatClockTime,
  formatDate,
  formatDateTime,
} from "@/lib/i18n/format";
import { requestStatusLabel, requestTypeLabel } from "@/lib/i18n/labels";
import type { MessageKey, Translate } from "@/lib/i18n/translate";
import { getBusinessDay } from "@/lib/usecases/businessDay";

type RequestEntity = {
  id: string;
  branch_id: string;
  user_id: string;
  request_type: string;
  title: string | null;
  content: string | null;
  /** SCRUM-82: the day the đơn is about; null for "Khác" and for rows filed before that script. */
  work_date: string | null;
  shift_id: string | null;
  target_employee_id: string | null;
  status: string;
  reject_reason: string | null;
  approver_id: string | null;
  created_at: string;
  updated_at: string;
  requester: { id: string; full_name: string } | null;
  /** The ca handed over, embedded from the `shift_id` foreign key (SCRUM-82). */
  shift: { id: string; name: string; start_time: string | null; end_time: string | null } | null;
  /** The colleague who takes it, embedded from `target_employee_id`. */
  target_employee: { id: string; full_name: string } | null;
};

// SCRUM-61 needs `manager_id`: it is what says whether the caller heads the branch.
type Branch = { id: string; name: string; manager_id: string | null };

/** The caller's own ca of one day, as `GET /api/schedules` embeds it (SCRUM-82). */
type OwnShiftAssignment = {
  id: string;
  shift_id: string;
  work_date: string;
  status: string;
  shift: {
    id: string;
    name: string;
    start_time: string | null;
    end_time: string | null;
  } | null;
};

/** One colleague `GET /api/requests/swap-candidates` offers. */
type SwapCandidate = { id: string; full_name: string };

/**
 * What was loaded *for which question*. Keeping the question next to the answer is what lets the dialog
 * say "đang tải" for a day/ca the caller has just changed instead of showing the previous answer as if it
 * were about the new one — and it needs no state reset in an effect, which React 19's lint forbids.
 */
type OwnShifts = { workDate: string; rows: OwnShiftAssignment[]; error: string };
type Candidates = { workDate: string; shiftId: string; rows: SwapCandidate[]; error: string };

type LoadResult = {
  requests: RequestEntity[];
  branches: Branch[];
  error: string | null;
};

type RejectTarget = { id: string; label: string };

/**
 * The submit dialog: one đơn for one branch, cleared with `value.trim() || null` on the way out.
 *
 * SCRUM-82 added the three fields a đơn that acts on a day needs: the day itself, and — for "Đổi ca" —
 * the ca handed over plus the colleague who takes it.
 */
type RequestForm = {
  branchId: string;
  requestType: RequestType;
  title: string;
  content: string;
  workDate: string;
  shiftId: string;
  targetEmployeeId: string;
};

const EMPTY_FORM: RequestForm = {
  branchId: "",
  requestType: REQUEST_TYPES[0],
  title: "",
  content: "",
  workDate: "",
  shiftId: "",
  targetEmployeeId: "",
};

const inputClassName =
  "mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm font-normal outline-none focus:border-blue-500";

const STATUS_BADGES: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-rose-50 text-rose-700",
};

const TABS = [
  { key: "all", labelKey: "common.all" },
  { key: "PENDING", labelKey: "requestStatus.pending" },
  { key: "APPROVED", labelKey: "requestStatus.approved" },
  { key: "REJECTED", labelKey: "requestStatus.rejected" },
] as const satisfies readonly { key: string; labelKey: MessageKey }[];

/**
 * The reasons the team actually uses, offered as one-tap pills in the reject dialog.
 *
 * These are **data**, not copy: a pill writes its sentence into `requests.reject_reason`, which the
 * employee reads and the queue stores verbatim — translating them would write English into a
 * Vietnamese-first organization's records. `request_type` works the same way, and only its *display*
 * goes through the dictionary (`requestTypeLabel`).
 */
const REJECT_REASONS = [
  "Trùng lịch",
  "Hết phép năm có lương",
  "Nhân sự ca chưa đủ",
  "Nộp đơn muộn so với quy định",
];

const ALL = "all";

function statusBadge(status: string): string {
  return STATUS_BADGES[status] ?? "bg-slate-100 text-slate-500";
}

function initials(fullName: string | undefined): string {
  if (!fullName) {
    return "--";
  }

  return fullName
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default function RequestsPage() {
  // SCRUM-59/61: every role reads its own requests (`request:view`, narrowed by SCRUM-60's RLS), but
  // approving or rejecting needs `request:review` — and only for a branch the caller heads. An
  // employee, and a manager outside their branch, get a status list instead of the decision buttons.
  const { profile, can } = useProfile();
  const { locale, t } = useLocale();
  const viewerId = profile?.id ?? null;
  const managesAllBranches = can("branch:manage");
  const [requests, setRequests] = useState<RequestEntity[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  // SCRUM-61: a manager reviews their own branch's requests; the owner reviews every request,
  // including one that lost its branch (`branch_id` is `on delete set null`).
  const manageableIds = new Set(
    branches
      .filter((branch) =>
        canManageBranch(branch, { userId: viewerId, managesAllBranches }),
      )
      .map((branch) => branch.id),
  );
  const canReview = (request: RequestEntity) =>
    can("request:review") &&
    (managesAllBranches || manageableIds.has(request.branch_id)) &&
    // SCRUM-63: a branch head cannot decide their own đơn; the owner is the one role that may,
    // because nobody sits above them (`ReviewRequestUseCase` repeats this).
    (request.user_id !== viewerId || managesAllBranches);

  // The branches the "Gửi đơn mới" dialog may offer: an employee is pinned to the one they belong to
  // (the form renders a statement instead of a select for them), a manager files only for a branch
  // they head — `CreateRequestUseCase` refuses any other with a `403` — and nobody else can file.
  const submittableBranches = branches.filter(
    (branch) =>
      isManagerRole(profile?.role) &&
      canManageBranch(branch, { userId: viewerId, managesAllBranches }),
  );
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [tab, setTab] = useState(ALL);
  const [branchFilter, setBranchFilter] = useState(ALL);
  const [query, setQuery] = useState("");
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);
  const [reason, setReason] = useState("");
  const [reviewingId, setReviewingId] = useState("");

  // The submit half of SCRUM-41 (every member holds `request:create` except the owner, who reviews
  // instead of filing — SCRUM-63). Until this dialog existed the screen could only review đơn: nothing
  // in the app ever wrote the row the queue was waiting for.
  //
  // SCRUM-63: an employee belongs to one branch, so their đơn is filed there — an account with no
  // branch cannot file at all, and a manager who heads none has nothing to file against, which is why
  // the button is hidden rather than answered with a `403`.
  const ownBranchId = profile?.branch_id ?? null;
  const isManager = isManagerRole(profile?.role);
  const canSubmit =
    can("request:create") &&
    (isManager ? submittableBranches.length > 0 : ownBranchId !== null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [form, setForm] = useState<RequestForm>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // SCRUM-82: a đơn that acts on a day asks for it, and "Đổi ca" additionally for the ca handed over and
  // the colleague who takes it. The two lists come from the endpoint that owns each rule —
  // `GET /api/schedules` for the caller's own ca (RLS already narrows that read to their rows) and
  // `GET /api/requests/swap-candidates` for the colleagues the database itself would accept.
  const needsWorkDate = requestNeedsWorkDate(form.requestType);
  const needsSwap = requestNeedsSwapDetails(form.requestType);
  // SCRUM-86: a "Nghỉ phép" đơn covers the ca the employee actually holds that day (that is what approval
  // turns into `LEAVE`), so it reads the same own-ca list "Đổi ca" needs — the day is no longer free-form.
  const needsLeave = form.requestType === "Nghỉ phép";
  const needsOwnShift = needsSwap || needsLeave;
  // The two values the fetching effects below depend on, hoisted out of `form` so their dependency
  // entries are the values themselves and not the object that holds them.
  const formWorkDate = form.workDate;
  const formShiftId = form.shiftId;
  const [ownShifts, setOwnShifts] = useState<OwnShifts | null>(null);
  const [candidates, setCandidates] = useState<Candidates | null>(null);
  const [candidateQuery, setCandidateQuery] = useState("");

  // The form's `min` and the use case's "the day is not past" test are the same business day, so the
  // browser never offers a day the API would refuse (Asia/Bangkok, never the browser's own zone).
  const today = getBusinessDay(new Date());

  // Bumping the token re-runs the effect below; keeping the fetch inside the effect (instead
  // of a callback the effect calls) avoids setting state synchronously during render.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<LoadResult> {
      // The whole queue is fetched once and filtered in the browser: the KPI counters must stay
      // global, and the queue of one coffee chain fits comfortably in memory. `/api/requests`
      // still accepts `status`/`branch_id` for other clients.
      const [requestsResponse, branchesResponse] = await Promise.all([
        fetch("/api/requests", { cache: "no-store" }),
        fetch("/api/branches", { cache: "no-store" }),
      ]);

      if (!requestsResponse.ok) {
        const data = (await requestsResponse.json().catch(() => null)) as {
          error?: string;
        } | null;

        return {
          requests: [],
          branches: [],
          error: data?.error ?? t("requests.error.load"),
        };
      }

      return {
        requests: (await requestsResponse.json()) as RequestEntity[],
        branches: branchesResponse.ok
          ? ((await branchesResponse.json()) as Branch[])
          : [],
        error: null,
      };
    }

    load()
      .then((result) => {
        if (cancelled) {
          return;
        }

        setRequests(result.requests);
        setBranches(result.branches);
        setPageError(result.error ?? "");
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setRequests([]);
        setBranches([]);
        setPageError(t("error.network"));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken, t]);

  // The caller's own ca of the chosen day, for the "Ca cần đổi" picker and — since SCRUM-86 — for a
  // "Nghỉ phép" đơn, which may only name a day the employee is scheduled on: `employee_id` is the viewer,
  // so this reads their own roster and never a colleague's. `CreateRequestUseCase` asks the same question
  // again server-side and refuses a day without a ca, so this is a convenience, not the check.
  useEffect(() => {
    if (!submitOpen || !needsOwnShift || !formWorkDate || !viewerId) {
      return;
    }

    let cancelled = false;
    const workDate = formWorkDate;
    const params = new URLSearchParams({
      employee_id: viewerId,
      start_date: workDate,
      end_date: workDate,
    });

    fetch(`/api/schedules?${params}`, { cache: "no-store" })
      .then(async (response) => ({
        rows: response.ok
          ? ((await response.json()) as OwnShiftAssignment[])
          : [],
        error: response.ok ? "" : t("requests.shiftListError"),
      }))
      .then((result) => {
        if (cancelled) {
          return;
        }

        setOwnShifts({ workDate, ...result });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setOwnShifts({ workDate, rows: [], error: t("error.network") });
      });

    return () => {
      cancelled = true;
    };
  }, [submitOpen, needsOwnShift, formWorkDate, viewerId, t]);

  // The colleagues who may take that ca, straight from `eligible_swap_targets()` — the same function the
  // approval re-asks before it moves anything, so the picker can never offer a swap that would fail.
  useEffect(() => {
    if (!submitOpen || !needsSwap || !formWorkDate || !formShiftId) {
      return;
    }

    let cancelled = false;
    const workDate = formWorkDate;
    const shiftId = formShiftId;
    const params = new URLSearchParams({ work_date: workDate, shift_id: shiftId });

    fetch(`/api/requests/swap-candidates?${params}`, { cache: "no-store" })
      .then(async (response) => ({
        rows: response.ok ? ((await response.json()) as SwapCandidate[]) : [],
        error: response.ok ? "" : t("requests.swapTargetError"),
      }))
      .then((result) => {
        if (cancelled) {
          return;
        }

        setCandidates({ workDate, shiftId, ...result });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setCandidates({ workDate, shiftId, rows: [], error: t("error.network") });
      });

    return () => {
      cancelled = true;
    };
  }, [submitOpen, needsSwap, formWorkDate, formShiftId, t]);

  // Derived, never stored: an answer belongs to the day/ca it was loaded for, so changing the day reads
  // as "đang tải" instead of showing the previous answer as if it were about the new one — and no state
  // has to be cleared inside an effect (React 19's `react-hooks/set-state-in-effect`).
  const ownShiftsForDay =
    ownShifts && ownShifts.workDate === form.workDate ? ownShifts : null;
  // Only a `SCHEDULED` ca can be handed over or given up: `requireOwnShiftAssignment` accepts nothing
  // else, and a zero-length "Nghỉ" template is a day off, not work (SCRUM-86) — it can be neither handed
  // over nor be the ca a leave request covers.
  const myShifts = (ownShiftsForDay?.rows ?? []).filter(
    (row) =>
      row.status === "SCHEDULED" &&
      row.shift !== null &&
      row.shift.start_time !== null &&
      row.shift.end_time !== null &&
      row.shift.start_time !== row.shift.end_time,
  );
  const loadingShifts = needsOwnShift && !!form.workDate && !ownShiftsForDay;
  const shiftsError = ownShiftsForDay?.error ?? "";

  const swapCandidatesForShift =
    candidates &&
    candidates.workDate === form.workDate &&
    candidates.shiftId === form.shiftId
      ? candidates
      : null;
  const swapCandidates = swapCandidatesForShift?.rows ?? [];
  const loadingCandidates = needsSwap && !!form.shiftId && !swapCandidatesForShift;
  const candidatesError = swapCandidatesForShift?.error ?? "";

  const candidateKeyword = candidateQuery.trim().toLowerCase();
  const visibleCandidates = swapCandidates.filter(
    (candidate) =>
      !candidateKeyword ||
      candidate.full_name.toLowerCase().includes(candidateKeyword),
  );

  function refresh() {
    setLoading(true);
    setPageError("");
    setReloadToken((token) => token + 1);
  }

  const branchNames = useMemo(() => {
    const map = new Map<string, string>();
    branches.forEach((branch) => map.set(branch.id, branch.name));

    return map;
  }, [branches]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return requests.filter((item) => {
      if (tab !== ALL && item.status !== tab) {
        return false;
      }

      if (branchFilter !== ALL && item.branch_id !== branchFilter) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const requester = item.requester?.full_name ?? "";

      return `${requester} ${item.request_type} ${item.title ?? ""} ${
        item.content ?? ""
      }`
        .toLowerCase()
        .includes(keyword);
    });
  }, [requests, tab, branchFilter, query]);

  const pendingCount = requests.filter((item) => item.status === "PENDING").length;
  const approvedCount = requests.filter(
    (item) => item.status === "APPROVED",
  ).length;
  const rejectedCount = requests.filter(
    (item) => item.status === "REJECTED",
  ).length;

  function reviewErrorMessage(
    status: number,
    data: { error?: string } | null,
    t: Translate,
  ): string {
    if (status === 401) {
      return t("error.sessionExpired");
    }

    if (status === 403) {
      return t("requests.error.reviewForbidden");
    }

    if (status === 404) {
      return t("requests.error.reviewNotFound");
    }

    return data?.error ?? t("requests.error.reviewFailed");
  }

  async function review(
    id: string,
    status: "APPROVED" | "REJECTED",
    rejectReason?: string,
  ) {
    setReviewingId(id);
    setPageError("");

    try {
      const response = await fetch(`/api/requests/${id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          reject_reason: rejectReason?.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setPageError(reviewErrorMessage(response.status, data, t));
        return;
      }

      setRejectTarget(null);
      setReason("");
      refresh();
    } catch {
      setPageError(t("error.network"));
    } finally {
      setReviewingId("");
    }
  }

  function openSubmit() {
    // A branch head starts on the branch they head, an employee on the branch they belong to. SCRUM-63
    // narrowed this field twice: the list holds only branches the caller may file against (a manager
    // their own, an employee exactly one), and the API refuses anything else.
    setForm({
      ...EMPTY_FORM,
      branchId: isManager
        ? defaultBranchId(submittableBranches, {
            userId: viewerId,
            managesAllBranches,
          })
        : (ownBranchId ?? ""),
    });
    // The colleague picker is a search box, so a leftover query would hide the list on the next open.
    setCandidateQuery("");
    setFormError("");
    setSubmitOpen(true);
  }

  function closeSubmit() {
    setSubmitOpen(false);
    setFormError("");
  }

  function submitErrorMessage(
    status: number,
    data: { error?: string } | null,
    t: Translate,
  ): string {
    if (status === 401) {
      return t("error.sessionExpired");
    }

    if (status === 403) {
      return t("requests.error.submitForbidden");
    }

    if (status === 404) {
      return t("requests.error.branchNotFound");
    }

    // SCRUM-82: the colleague took another ca between the picker being loaded and the đơn being filed, so
    // the database's own sentence is the useful answer — and the screen reloads the list.
    if (status === 409) {
      return data?.error ?? t("requests.error.swapTargetNotFree");
    }

    // A `400` names the offending field or rule in Vietnamese (a day in the past, a ca that is not the
    // caller's), which is more useful than a generic sentence — both are Vietnamese and both are shown.
    if (status === 400) {
      return data?.error ?? t("requests.error.invalid");
    }

    return t("requests.error.submitFailed");
  }

  async function submitRequest() {
    if (!form.branchId) {
      setFormError(t("requests.error.branchRequired"));
      return;
    }

    if (!form.title.trim()) {
      setFormError(t("requests.error.titleRequired"));
      return;
    }

    // SCRUM-82: the same three rules the API states, so the dialog answers before a round trip — the day
    // has to exist and not be past, and a "Đổi ca" đơn has to name both the ca and the colleague.
    if (needsWorkDate && !form.workDate) {
      setFormError(t("requests.error.workDateRequired"));
      return;
    }

    if (needsWorkDate && form.workDate < today) {
      setFormError(t("requests.error.workDatePast"));
      return;
    }

    // SCRUM-86: a "Nghỉ phép" đơn is filed against ca the employee holds that day — that is what the
    // approval turns into a day off. The list is the same own-roster read the dialog already loaded (RLS
    // narrows it to their rows); the API repeats the rule, so this is the sentence that saves a round trip.
    if (needsLeave) {
      if (loadingShifts) {
        setFormError(t("requests.swapShiftLoading"));
        return;
      }

      if (shiftsError) {
        setFormError(shiftsError);
        return;
      }

      if (myShifts.length === 0) {
        setFormError(
          t("requests.error.leaveWithoutShift", {
            day: formatDate(form.workDate, locale),
          }),
        );
        return;
      }
    }

    if (needsSwap && (!form.shiftId || !form.targetEmployeeId)) {
      setFormError(t("requests.error.swapDetailsRequired"));
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: form.branchId,
          request_type: form.requestType,
          title: form.title.trim(),
          // A blank note travels as null, never as an empty string.
          content: form.content.trim() || null,
          // A type that acts on nothing sends nothing (SCRUM-82), which is what the API stores anyway.
          work_date: needsWorkDate ? form.workDate : null,
          shift_id: needsSwap ? form.shiftId : null,
          target_employee_id: needsSwap ? form.targetEmployeeId : null,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setFormError(submitErrorMessage(response.status, data, t));
        return;
      }

      closeSubmit();
      // The new đơn is `PENDING`, so jump back to the tab that shows it instead of leaving the
      // caller on a status filter where nothing seems to have happened.
      setTab(ALL);
      refresh();
    } catch {
      setFormError(t("error.network"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {t("requests.eyebrow")}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {can("request:review")
              ? t("requests.titleReviewer")
              : t("requests.titleOwner")}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {can("request:review")
              ? t("requests.subtitleReviewer")
              : t("requests.subtitleOwner")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          {canSubmit && (
            <button
              type="button"
              onClick={openSubmit}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong"
            >
              <Plus size={14} />
              {t("requests.createButton")}
            </button>
          )}
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
            {t("common.reload")}
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-blue-200 bg-surface p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
            {t("requests.kpiTotal")}
          </p>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {requests.length}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            {t("requests.kpiTotalNote")}
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-amber-200 bg-surface p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
            {t("requestStatus.pending")}
          </p>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {pendingCount}
          </p>
          <p className="mt-1 text-[10px] text-amber-600">
            {t("requests.kpiPendingNote")}
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-emerald-200 bg-surface p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
            {t("requestStatus.approved")}
          </p>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {approvedCount}
          </p>
          <p className="mt-1 text-[10px] text-emerald-600">
            {t("requests.kpiApprovedNote")}
          </p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-rose-200 bg-surface p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
            {t("requestStatus.rejected")}
          </p>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {rejectedCount}
          </p>
          <p className="mt-1 text-[10px] text-rose-600">
            {t("requests.kpiRejectedNote")}
          </p>
        </article>
      </div>

      {pageError && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
        >
          {pageError}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-surface shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-1" role="group" aria-label={t("common.filterStatusAria")}>
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  tab === item.key
                    ? "bg-primary text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={t("common.filterBranchAria")}
              value={branchFilter}
              onChange={(event) => setBranchFilter(event.target.value)}
              className="rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs outline-none focus:border-primary"
            >
              <option value={ALL}>{t("common.allBranches")}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-app px-3 py-2 text-xs xl:w-72">
              <Search size={14} className="shrink-0 text-slate-400" />
              <input
                aria-label={t("requests.searchAria")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("requests.searchPlaceholder")}
                className="w-full bg-transparent outline-none placeholder:text-slate-400"
              />
            </label>
          </div>
        </div>

        <p className="border-b border-slate-100 px-4 py-2 text-[10px] text-slate-400">
          {t("requests.filteredCount", { count: filtered.length })}
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-xs">
            <thead className="bg-surface-muted text-[9px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t("common.employee")}</th>
                <th className="px-4 py-3">{t("requests.columnContent")}</th>
                <th className="px-4 py-3">{t("common.branch")}</th>
                <th className="px-4 py-3">{t("requests.columnUpdated")}</th>
                <th className="px-4 py-3">{t("common.status")}</th>
                <th className="px-4 py-3 text-right">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr className="border-t border-slate-100">
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-primary" />
                      {t("requests.loading")}
                    </span>
                  </td>
                </tr>
              )}

              {!loading && filtered.length === 0 && (
                <tr className="border-t border-slate-100">
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    {requests.length === 0
                      ? canSubmit
                        ? t("requests.emptyCanSubmit")
                        : can("request:create") && isManager
                          ? t("requests.emptyManagerNoBranch")
                          : can("request:create") && ownBranchId === null
                            ? t("requests.emptyEmployeeNoBranch")
                            : t("requests.emptyNone")
                      : t("requests.emptyFiltered")}
                  </td>
                </tr>
              )}

              {!loading &&
                filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-slate-100 align-top transition-colors hover:bg-slate-50/70"
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-primary">
                          {initials(item.requester?.full_name)}
                        </span>
                        <div>
                          <p className="font-semibold text-slate-900">
                            {item.requester?.full_name ??
                              t("common.unknownEmployee", {
                                code: item.user_id.slice(0, 4),
                              })}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {requestTypeLabel(item.request_type, t)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-72 px-4 py-4">
                      <p className="font-medium text-slate-700">
                        {item.title ?? t("requests.untitled")}
                      </p>
                      {item.content && (
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {item.content}
                        </p>
                      )}
                      {/* SCRUM-82: the day the đơn acts on, and — for "Đổi ca" — the ca it hands over and
                          the colleague who takes it. */}
                      {item.work_date && (
                        <p className="mt-1 inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-slate-500">
                          <CalendarDays size={11} className="text-slate-400" />
                          {t("requests.workDateCell", {
                            day: formatDate(item.work_date, locale),
                          })}
                        </p>
                      )}
                      {item.shift_id && (
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {t("requests.swapCell", {
                            shift: item.shift
                              ? `${item.shift.name} ${formatClockTime(
                                  item.shift.start_time,
                                )}–${formatClockTime(item.shift.end_time)}`
                              : "—",
                            name: item.target_employee?.full_name ?? "—",
                          })}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {branchNames.get(item.branch_id) ?? "—"}
                    </td>
                    <td className="px-4 py-4 tabular-nums text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 size={12} className="text-slate-400" />
                        {formatDateTime(item.updated_at, locale)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusBadge(
                          item.status,
                        )}`}
                      >
                        {requestStatusLabel(item.status, t)}
                      </span>
                      {item.reject_reason && (
                        <p className="mt-1 max-w-48 text-[11px] text-rose-600">
                          {item.reject_reason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {item.user_id === viewerId && !managesAllBranches ? (
                        // SCRUM-63: a branch head may not decide their own đơn, so the buttons are
                        // not offered at all (the owner, who may, keeps them).
                        <span className="text-[11px] text-slate-400">
                          {t("requests.ownRequest")}
                        </span>
                      ) : !canReview(item) ? (
                        <span className="text-[11px] text-slate-400">
                          {t("common.viewOnly")}
                        </span>
                      ) : item.status === "PENDING" ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void review(item.id, "APPROVED")}
                            disabled={reviewingId === item.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                          >
                            {reviewingId === item.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Check size={13} />
                            )}
                            {t("requests.approve")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectTarget({
                                id: item.id,
                                label:
                                  item.requester?.full_name ??
                                  t("common.unknownEmployee", {
                                    code: item.user_id.slice(0, 4),
                                  }),
                              });
                              setReason("");
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-100"
                          >
                            <X size={13} />
                            {t("requests.reject")}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          {t("requests.reviewed")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {submitOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
                  <Send size={18} />
                </span>
                <div>
                  <h2 className="font-bold text-slate-900">
                    {t("requests.submitTitle")}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {t("requests.submitSubtitle", {
                      status: t("requestStatus.pending"),
                    })}
                  </p>
                </div>
              </div>
              <button type="button" aria-label={t("common.close")} onClick={closeSubmit}>
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-600">
                  {t("requests.typeLabel")}{" "}
                  <span className="text-rose-500">*</span>
                  <select
                    value={form.requestType}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        requestType: event.target.value as RequestType,
                      }))
                    }
                    className={inputClassName}
                  >
                    {REQUEST_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {requestTypeLabel(type, t)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs font-semibold text-slate-600">
                  {t("common.branch")}{" "}
                  <span className="text-rose-500">*</span>
                  {isManager ? (
                    <select
                      value={form.branchId}
                      onChange={(event) =>
                        setForm((value) => ({
                          ...value,
                          branchId: event.target.value,
                        }))
                      }
                      className={inputClassName}
                    >
                      <option value="">{t("requests.chooseBranch")}</option>
                      {submittableBranches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    // SCRUM-63: an employee files for the branch they belong to, so this field is a
                    // statement rather than a choice — the API refuses any other branch anyway.
                    <span className="mt-1 block rounded-lg border border-slate-200 bg-app px-3 py-2 text-sm font-normal text-slate-600">
                      {branchNames.get(ownBranchId ?? "") ?? "—"}
                      <span className="mt-0.5 block text-[10px] text-slate-400">
                        {t("requests.employeeBranchNote")}
                      </span>
                    </span>
                  )}
                </label>
              </div>

              {branches.length === 0 && (
                <p className="text-[11px] text-amber-600">
                  {t("requests.noBranches")}
                </p>
              )}

              {/* SCRUM-82: a đơn that acts on a day names it, and the API refuses a day that is already
                  gone — this `min` is the same Asia/Bangkok day the use case compares against, so the
                  browser never offers one the server would reject. */}
              {needsWorkDate && (
                <label className="block text-xs font-semibold text-slate-600">
                  {t("requests.workDateLabel")}{" "}
                  <span className="text-rose-500">*</span>
                  <input
                    type="date"
                    value={form.workDate}
                    min={today}
                    onChange={(event) => {
                      // A different day means a different ca and different colleagues: both picks are
                      // dropped rather than silently kept for a day they do not belong to.
                      setForm((value) => ({
                        ...value,
                        workDate: event.target.value,
                        shiftId: "",
                        targetEmployeeId: "",
                      }));
                      setCandidateQuery("");
                    }}
                    className={inputClassName}
                  />
                  <span className="mt-1 block text-[10px] font-normal text-slate-400">
                    {t("requests.workDateNote")}
                  </span>
                </label>
              )}

              {/*
                SCRUM-86: an approved “Nghỉ phép” turns that day's ca into a day off, so the day has to be one
                the employee actually works. The list is read-only here — the ca is not chosen, the whole day
                is — and the amber line is the same sentence the API answers.
              */}
              {needsLeave && form.workDate && (
                <div className="block text-xs font-semibold text-slate-600">
                  {t("requests.leaveShiftLabel")}
                  {loadingShifts ? (
                    <span className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-app px-3 py-2 text-xs font-normal text-slate-500">
                      <Loader2 size={13} className="animate-spin text-primary" />
                      {t("requests.swapShiftLoading")}
                    </span>
                  ) : shiftsError ? (
                    <span className="mt-1 block text-[10px] font-normal text-rose-600">
                      {shiftsError}
                    </span>
                  ) : myShifts.length === 0 ? (
                    <span className="mt-1 block text-[10px] font-normal text-amber-600">
                      {t("requests.error.leaveWithoutShift", {
                        day: formatDate(form.workDate, locale),
                      })}
                    </span>
                  ) : (
                    <>
                      <ul className="mt-1 space-y-1 rounded-lg border border-slate-200 bg-app px-3 py-2 text-[11px] font-normal text-slate-700">
                        {myShifts.map((row) => (
                          <li
                            key={row.id}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="truncate">
                              {row.shift?.name ?? t("common.shift")}
                            </span>
                            <span className="shrink-0 tabular-nums text-slate-500">
                              {formatClockTime(row.shift?.start_time ?? null)}–
                              {formatClockTime(row.shift?.end_time ?? null)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <span className="mt-1 block text-[10px] font-normal text-slate-400">
                        {t("requests.leaveShiftNote")}
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* "Đổi ca" hands one of the caller's own ca to a colleague, so the two picks are the ca
                  (from their own roster — RLS narrows that read to their rows) and the colleague (from
                  the RPC the approval re-asks). Both only make sense once a day is named. */}
              {needsSwap && form.workDate && (
                <>
                  <div className="block text-xs font-semibold text-slate-600">
                    {t("requests.swapShiftLabel")}{" "}
                    <span className="text-rose-500">*</span>
                    {loadingShifts ? (
                      <span className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-app px-3 py-2 text-xs font-normal text-slate-500">
                        <Loader2 size={13} className="animate-spin text-primary" />
                        {t("requests.swapShiftLoading")}
                      </span>
                    ) : (
                      <select
                        aria-label={t("requests.swapShiftLabel")}
                        value={form.shiftId}
                        onChange={(event) => {
                          // The colleague list belongs to one ca, so it is dropped with the ca.
                          setForm((value) => ({
                            ...value,
                            shiftId: event.target.value,
                            targetEmployeeId: "",
                          }));
                          setCandidateQuery("");
                        }}
                        className={inputClassName}
                      >
                        <option value="">
                          {t("requests.swapShiftPlaceholder")}
                        </option>
                        {myShifts.map((row) => (
                          <option key={row.id} value={row.shift_id}>
                            {row.shift
                              ? `${row.shift.name} ${formatClockTime(
                                  row.shift.start_time,
                                )}–${formatClockTime(row.shift.end_time)}`
                              : "--:--"}
                          </option>
                        ))}
                      </select>
                    )}
                    {shiftsError && (
                      <span className="mt-1 block text-[10px] font-normal text-rose-600">
                        {shiftsError}
                      </span>
                    )}
                    {!loadingShifts && !shiftsError && myShifts.length === 0 && (
                      <span className="mt-1 block text-[10px] font-normal text-amber-600">
                        {t("requests.swapShiftEmpty")}
                      </span>
                    )}
                  </div>

                  <div className="block text-xs font-semibold text-slate-600">
                    {t("requests.swapTargetLabel")}{" "}
                    <span className="text-rose-500">*</span>
                    <input
                      value={candidateQuery}
                      onChange={(event) => {
                        // Typing means "search again", so the chosen colleague is dropped — a name the
                        // list does not contain can never be submitted.
                        setCandidateQuery(event.target.value);
                        setForm((value) => ({ ...value, targetEmployeeId: "" }));
                      }}
                      disabled={!form.shiftId}
                      placeholder={t("requests.swapTargetPlaceholder")}
                      className={`${inputClassName} disabled:bg-app disabled:text-slate-400`}
                    />
                    {loadingCandidates && (
                      <span className="mt-1 flex items-center gap-2 text-[10px] font-normal text-slate-400">
                        <Loader2 size={12} className="animate-spin text-primary" />
                        {t("requests.swapTargetLoading")}
                      </span>
                    )}
                    {!loadingCandidates && candidatesError && (
                      <span className="mt-1 block text-[10px] font-normal text-rose-600">
                        {candidatesError}
                      </span>
                    )}
                    {form.shiftId &&
                      !loadingCandidates &&
                      !candidatesError &&
                      swapCandidates.length === 0 && (
                        <span className="mt-1 block text-[10px] font-normal text-amber-600">
                          {t("requests.swapTargetEmpty")}
                        </span>
                      )}
                    {form.shiftId &&
                      !loadingCandidates &&
                      !candidatesError &&
                      swapCandidates.length > 0 && (
                        <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200">
                          {visibleCandidates.length === 0 ? (
                            <p className="px-3 py-2 text-[11px] font-normal text-slate-400">
                              {t("requests.swapTargetNoMatch")}
                            </p>
                          ) : (
                            visibleCandidates.map((candidate) => (
                              <button
                                key={candidate.id}
                                type="button"
                                onClick={() => {
                                  setForm((value) => ({
                                    ...value,
                                    targetEmployeeId: candidate.id,
                                  }));
                                  setCandidateQuery(candidate.full_name);
                                }}
                                className={`block w-full px-3 py-2 text-left text-[11px] font-normal transition-colors ${
                                  form.targetEmployeeId === candidate.id
                                    ? "bg-blue-50 font-semibold text-primary"
                                    : "text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                {candidate.full_name || "—"}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                  </div>
                </>
              )}

              <label className="block text-xs font-semibold text-slate-600">
                {t("requests.titleLabel")}{" "}
                <span className="text-rose-500">*</span>
                <input
                  value={form.title}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, title: event.target.value }))
                  }
                  maxLength={MAX_REQUEST_TITLE_LENGTH}
                  placeholder={t("requests.titlePlaceholder")}
                  className={inputClassName}
                />
              </label>

              <label className="block text-xs font-semibold text-slate-600">
                {t("requests.contentLabel")}
                <textarea
                  value={form.content}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, content: event.target.value }))
                  }
                  maxLength={MAX_REQUEST_CONTENT_LENGTH}
                  rows={4}
                  placeholder={t("requests.contentPlaceholder")}
                  className={`${inputClassName} resize-none`}
                />
              </label>

              {formError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  {formError}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeSubmit}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void submitRequest()}
                disabled={
                  saving ||
                  !form.branchId ||
                  !form.title.trim() ||
                  // The own-ca read decides whether a leave may be filed at all, so it cannot be half-loaded.
                  (needsOwnShift && loadingShifts)
                }
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:opacity-50"
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                {saving ? t("requests.sending") : t("requests.submitButton")}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-surface p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-bold text-slate-900">
                  {t("requests.rejectTitle")}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {t("requests.rejectSubtitle", { name: rejectTarget.label })}
                </p>
              </div>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={() => setRejectTarget(null)}
              >
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {REJECT_REASONS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReason(preset)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    reason === preset
                      ? "border-blue-200 bg-blue-50 font-semibold text-blue-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              maxLength={500}
              placeholder={t("requests.rejectReasonPlaceholder")}
              className="mt-4 w-full resize-none rounded-lg border border-slate-200 p-3 text-sm font-normal outline-none focus:border-blue-500"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={!reason.trim() || reviewingId === rejectTarget.id}
                onClick={() =>
                  void review(rejectTarget.id, "REJECTED", reason)
                }
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {reviewingId === rejectTarget.id && (
                  <Loader2 size={13} className="animate-spin" />
                )}
                {t("requests.rejectConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
