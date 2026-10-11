"use client";

import {
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

import { useProfile } from "@/components/ProfileProvider";
import { canManageBranch, defaultBranchId } from "@/lib/domain/branchScope";
import {
  MAX_REQUEST_CONTENT_LENGTH,
  MAX_REQUEST_TITLE_LENGTH,
  REQUEST_TYPES,
  type RequestType,
} from "@/lib/domain/entities/RequestEntity";
import { isManagerRole } from "@/lib/domain/roles";

type RequestEntity = {
  id: string;
  branch_id: string;
  user_id: string;
  request_type: string;
  title: string | null;
  content: string | null;
  status: string;
  reject_reason: string | null;
  approver_id: string | null;
  created_at: string;
  updated_at: string;
  requester: { id: string; full_name: string } | null;
};

// SCRUM-61 needs `manager_id`: it is what says whether the caller heads the branch.
type Branch = { id: string; name: string; manager_id: string | null };

type LoadResult = {
  requests: RequestEntity[];
  branches: Branch[];
  error: string | null;
};

type RejectTarget = { id: string; label: string };

/** The submit dialog: one đơn for one branch, cleared with `value.trim() || null` on the way out. */
type RequestForm = {
  branchId: string;
  requestType: RequestType;
  title: string;
  content: string;
};

const EMPTY_FORM: RequestForm = {
  branchId: "",
  requestType: REQUEST_TYPES[0],
  title: "",
  content: "",
};

const inputClassName =
  "mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm font-normal outline-none focus:border-blue-500";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
};

const STATUS_BADGES: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-rose-50 text-rose-700",
};

const TABS = [
  { key: "all", label: "Tất cả" },
  { key: "PENDING", label: "Chờ duyệt" },
  { key: "APPROVED", label: "Đã duyệt" },
  { key: "REJECTED", label: "Từ chối" },
];

/** The reasons the team actually uses, offered as one-tap pills in the reject dialog. */
const REJECT_REASONS = [
  "Trùng lịch",
  "Hết phép năm có lương",
  "Nhân sự ca chưa đủ",
  "Nộp đơn muộn so với quy định",
];

const ALL = "all";

// Timestamps are stored and served in UTC while the business timezone is Asia/Bangkok, so the
// formatter pins the zone instead of using the browser default (see AGENTS.md).
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Bangkok",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateTime(value: string): string {
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? "—" : dateTimeFormatter.format(parsed);
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

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
          error: data?.error ?? "Không thể tải danh sách đơn từ.",
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
        setPageError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

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
  ): string {
    if (status === 401) {
      return "Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.";
    }

    if (status === 403) {
      return "Tài khoản của bạn không có quyền duyệt đơn (chỉ chủ sở hữu hoặc quản lý).";
    }

    if (status === 404) {
      return "Không tìm thấy đơn cần duyệt. Có thể đơn đã bị xoá.";
    }

    return data?.error ?? "Không thể cập nhật đơn. Vui lòng thử lại.";
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
        setPageError(reviewErrorMessage(response.status, data));
        return;
      }

      setRejectTarget(null);
      setReason("");
      refresh();
    } catch {
      setPageError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
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
    setFormError("");
    setSubmitOpen(true);
  }

  function closeSubmit() {
    setSubmitOpen(false);
    setFormError("");
  }

  function submitErrorMessage(status: number): string {
    if (status === 401) {
      return "Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.";
    }

    if (status === 403) {
      return "Tài khoản của bạn không có quyền gửi đơn.";
    }

    if (status === 404) {
      return "Không tìm thấy chi nhánh đã chọn. Vui lòng chọn lại chi nhánh.";
    }

    if (status === 400) {
      return "Nội dung đơn không hợp lệ. Vui lòng kiểm tra lại tiêu đề và ghi chú.";
    }

    return "Không thể gửi đơn. Vui lòng thử lại.";
  }

  async function submitRequest() {
    if (!form.branchId) {
      setFormError("Vui lòng chọn chi nhánh.");
      return;
    }

    if (!form.title.trim()) {
      setFormError("Vui lòng nhập tiêu đề đơn.");
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
        }),
      });

      if (!response.ok) {
        setFormError(submitErrorMessage(response.status));
        return;
      }

      closeSubmit();
      // The new đơn is `PENDING`, so jump back to the tab that shows it instead of leaving the
      // caller on a status filter where nothing seems to have happened.
      setTab(ALL);
      refresh();
    } catch {
      setFormError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Nhân sự / SCRUM-41
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {can("request:review") ? "Quản lý duyệt đơn" : "Đơn từ của tôi"}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {can("request:review")
              ? "Duyệt hoặc từ chối đơn nghỉ phép, đổi ca và điều chỉnh công của nhân viên."
              : "Theo dõi trạng thái những đơn bạn đã gửi: nghỉ phép, đổi ca và điều chỉnh công."}
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
              Tạo đơn
            </button>
          )}
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
            Làm mới
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-blue-200 bg-surface p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
            Tổng đơn
          </p>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {requests.length}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">Toàn bộ đơn trên hệ thống</p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-amber-200 bg-surface p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
            Chờ duyệt
          </p>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {pendingCount}
          </p>
          <p className="mt-1 text-[10px] text-amber-600">Cần quản lý xử lý</p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-emerald-200 bg-surface p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
            Đã duyệt
          </p>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {approvedCount}
          </p>
          <p className="mt-1 text-[10px] text-emerald-600">Đã ghi nhận vào lịch</p>
        </article>

        <article className="rounded-xl border border-slate-200/80 border-b-2 border-b-rose-200 bg-surface p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
            Từ chối
          </p>
          <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {rejectedCount}
          </p>
          <p className="mt-1 text-[10px] text-rose-600">Kèm lý do cho nhân viên</p>
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
          <div className="flex flex-wrap gap-1" role="group" aria-label="Lọc theo trạng thái">
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
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Lọc theo chi nhánh"
              value={branchFilter}
              onChange={(event) => setBranchFilter(event.target.value)}
              className="rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs outline-none focus:border-primary"
            >
              <option value={ALL}>Tất cả chi nhánh</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-app px-3 py-2 text-xs xl:w-72">
              <Search size={14} className="shrink-0 text-slate-400" />
              <input
                aria-label="Tìm đơn từ"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm nhân viên, loại đơn, nội dung"
                className="w-full bg-transparent outline-none placeholder:text-slate-400"
              />
            </label>
          </div>
        </div>

        <p className="border-b border-slate-100 px-4 py-2 text-[10px] text-slate-400">
          {filtered.length} đơn phù hợp bộ lọc hiện tại
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-xs">
            <thead className="bg-surface-muted text-[9px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Nhân viên</th>
                <th className="px-4 py-3">Nội dung đơn</th>
                <th className="px-4 py-3">Chi nhánh</th>
                <th className="px-4 py-3">Cập nhật</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr className="border-t border-slate-100">
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-primary" />
                      Đang tải danh sách đơn...
                    </span>
                  </td>
                </tr>
              )}

              {!loading && filtered.length === 0 && (
                <tr className="border-t border-slate-100">
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    {requests.length === 0
                      ? canSubmit
                        ? "Chưa có đơn nào được gửi — bấm “Tạo đơn” để gửi đơn đầu tiên"
                        : can("request:create") && isManager
                          ? "Bạn chưa phụ trách chi nhánh nào — nhờ chủ sở hữu gán bạn làm chi nhánh trưởng ở trang Quản lý chi nhánh để gửi đơn"
                          : can("request:create") && ownBranchId === null
                            ? "Bạn chưa được gán chi nhánh — nhờ chủ sở hữu gán chi nhánh ở trang Quản lý nhân sự để gửi đơn"
                            : "Chưa có đơn nào được gửi"
                      : "Không có đơn phù hợp bộ lọc hiện tại"}
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
                              `Nhân viên #${item.user_id.slice(0, 4)}`}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {item.request_type}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-72 px-4 py-4">
                      <p className="font-medium text-slate-700">
                        {item.title ?? "Không có tiêu đề"}
                      </p>
                      {item.content && (
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {item.content}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {branchNames.get(item.branch_id) ?? "—"}
                    </td>
                    <td className="px-4 py-4 tabular-nums text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 size={12} className="text-slate-400" />
                        {formatDateTime(item.updated_at)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusBadge(
                          item.status,
                        )}`}
                      >
                        {statusLabel(item.status)}
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
                        <span className="text-[11px] text-slate-400">Đơn của bạn</span>
                      ) : !canReview(item) ? (
                        <span className="text-[11px] text-slate-400">Chỉ xem</span>
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
                            Duyệt
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectTarget({
                                id: item.id,
                                label:
                                  item.requester?.full_name ??
                                  `Nhân viên #${item.user_id.slice(0, 4)}`,
                              });
                              setReason("");
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-100"
                          >
                            <X size={13} />
                            Từ chối
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">Đã xử lý</span>
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
                  <h2 className="font-bold text-slate-900">Gửi đơn mới</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Đơn được gửi tới quản lý chi nhánh để duyệt và giữ trạng thái
                    &quot;Chờ duyệt&quot; cho tới khi được xử lý.
                  </p>
                </div>
              </div>
              <button type="button" aria-label="Đóng" onClick={closeSubmit}>
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-600">
                  Loại đơn <span className="text-rose-500">*</span>
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
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs font-semibold text-slate-600">
                  Chi nhánh <span className="text-rose-500">*</span>
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
                      <option value="">Chọn chi nhánh</option>
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
                        Đơn luôn thuộc chi nhánh bạn làm việc
                      </span>
                    </span>
                  )}
                </label>
              </div>

              {branches.length === 0 && (
                <p className="text-[11px] text-amber-600">
                  Chưa có chi nhánh nào để chọn. Vui lòng nhờ chủ sở hữu tạo chi nhánh
                  trước khi gửi đơn.
                </p>
              )}

              <label className="block text-xs font-semibold text-slate-600">
                Tiêu đề <span className="text-rose-500">*</span>
                <input
                  value={form.title}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, title: event.target.value }))
                  }
                  maxLength={MAX_REQUEST_TITLE_LENGTH}
                  placeholder="Xin nghỉ phép ngày 12/10"
                  className={inputClassName}
                />
              </label>

              <label className="block text-xs font-semibold text-slate-600">
                Nội dung chi tiết
                <textarea
                  value={form.content}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, content: event.target.value }))
                  }
                  maxLength={MAX_REQUEST_CONTENT_LENGTH}
                  rows={4}
                  placeholder="Lý do, khoảng thời gian mong muốn, ca cần đổi..."
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
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => void submitRequest()}
                disabled={saving || !form.branchId || !form.title.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:opacity-50"
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                {saving ? "Đang gửi..." : "Gửi đơn"}
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
                <h2 className="font-bold text-slate-900">Từ chối đơn</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Đơn của {rejectTarget.label}. Lý do là bắt buộc theo yêu cầu nghiệp vụ và
                  sẽ được gửi tới nhân viên.
                </p>
              </div>
              <button
                type="button"
                aria-label="Đóng"
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
              placeholder="Nhập lý do từ chối..."
              className="mt-4 w-full resize-none rounded-lg border border-slate-200 p-3 text-sm font-normal outline-none focus:border-blue-500"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold"
              >
                Hủy
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
                Xác nhận từ chối
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
