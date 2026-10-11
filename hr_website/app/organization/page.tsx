"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Landmark,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

import { roleLabel } from "@/lib/accessPolicy";
import { INVITE_ROLES } from "@/lib/domain/entities/OrganizationInvite";
import { MEMBER_CONFLICT_MARKER } from "@/lib/domain/errors/StaffAccountEmailTakenError";

type OrganizationSummary = {
  organization: { id: string; name: string; created_at: string } | null;
  code: string | null;
  member_count: number;
  pending_invite_count: number;
};

type OrganizationInvite = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  source: string;
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
};

/** The roles an invite may carry (`INVITE_ROLES`, SCRUM-59): a manager or an employee, never an owner. */
const INVITE_ROLE_OPTIONS = INVITE_ROLES;

/** Same minimum the API and the Edge Function enforce. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * The provisioning form's own copy. `409` covers two different conflicts and the fix differs, so
 * the API forwards the Edge Function's own sentence — `StaffAccountEmailTakenError` documents both
 * cases and exports the marker below. With the marker the address is already a member and there is
 * nothing left to create; without it the address merely has its own Supabase Auth login, which is
 * *not* necessarily visible in `public.users` (a `createUser` that ran while the SCRUM-50 trigger was
 * missing leaves an auth account with no profile row), hence the copy names where to look.
 */
function accountErrorMessage(status: number, serverMessage?: string): string {
  if (status === 409) {
    if (serverMessage?.includes(MEMBER_CONFLICT_MARKER)) {
      return "Email này đã là thành viên của tổ chức (xem danh sách bên dưới) — không cần tạo lại.";
    }

    return "Email này đã có tài khoản đăng nhập trong Supabase nhưng chưa vào tổ chức, nên không tạo mới được. Hãy để người này đăng nhập bằng chính tài khoản đó rồi vào tổ chức bằng mã tham gia ở trên — nếu email chưa có trong danh sách bên dưới, hãy bấm \"Thêm vào danh sách\" trước. Nếu họ không đăng nhập được vì lần tạo trước bị bỏ dở, hãy mở Authentication → Users trong Supabase, xóa tài khoản còn sót của email này rồi tạo lại.";
  }

  if (status === 429) {
    return "Tổ chức đã tạo quá nhiều tài khoản trong một giờ. Vui lòng thử lại sau.";
  }

  if (status === 503) {
    return "Chức năng tạo tài khoản chưa được bật: cần triển khai Edge Function `staff-account` (xem README). Trong lúc đó hãy dùng \"Thêm vào danh sách\".";
  }

  return actionErrorMessage(status, serverMessage);
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(parsed);
}

function actionErrorMessage(status: number, serverMessage?: string): string {
  if (status === 401) {
    return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  }

  if (status === 403) {
    return "Chỉ chủ sở hữu (OWNER) mới thực hiện được thao tác này.";
  }

  if (status === 404) {
    return "Không tìm thấy dữ liệu cần thao tác.";
  }

  if (status === 409) {
    return "Email này đã có trong danh sách của tổ chức.";
  }

  if (status === 400) {
    return serverMessage ?? "Thông tin chưa hợp lệ.";
  }

  return serverMessage ?? "Không thực hiện được thao tác. Vui lòng thử lại.";
}

type StaffProvisioningAvailability = {
  available: boolean;
  reason: string;
  detail: string | null;
};

/**
 * Vietnamese copy for the reason the probe reported (SCRUM-52). "Not deployed" is something the
 * operator fixes, "not allowed" is a role problem and "misconfigured" means the function is there but
 * failing — three different actions, so they must not share one sentence.
 */
function provisioningNote(
  availability: StaffProvisioningAvailability | null,
): string {
  switch (availability?.reason) {
    case "not_allowed":
      return "Tài khoản của bạn cần thuộc một tổ chức với vai trò chủ sở hữu (OWNER) mới tạo được tài khoản cho nhân viên.";
    case "unauthenticated":
      return "Edge Function đã từ chối phiên đăng nhập. Kiểm tra lại function `staff-account`: phải bật \"Verify JWT\" và không được tắt xác thực token.";
    case "misconfigured":
      return `Edge Function đã deploy nhưng đang báo lỗi${
        availability?.detail ? `: ${availability.detail}` : "."
      } Kiểm tra secrets của function (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) và log của nó.`;
    case "ready":
      return "";
    default:
      return "Chưa kết nối được Edge Function `staff-account`. Hãy deploy nó trong Supabase: Edge Functions → Create a new function → tên chính xác là `staff-account` → dán nội dung supabase/functions/staff-account/index.ts → Deploy (giữ Verify JWT bật), rồi tải lại trang này.";
  }
}

const inputClassName =
  "w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-500/15";

export default function OrganizationPage() {
  const [summary, setSummary] = useState<OrganizationSummary | null>(null);
  const [invites, setInvites] = useState<OrganizationInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<
    "name" | "code" | "invite" | "revoke" | "account" | ""
  >("");
  const [nameDraft, setNameDraft] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("EMPLOYEE");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountFullName, setAccountFullName] = useState("");
  const [accountRole, setAccountRole] = useState<string>("EMPLOYEE");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPasswordVisible, setAccountPasswordVisible] = useState(false);
  // SCRUM-52: the provisioning form reports its own outcome. The page-level banners live above the
  // summary cards, so an error there is off-screen while the owner is looking at this form — which
  // reads as "nothing happened" (and invites a second click that now answers 409).
  const [accountError, setAccountError] = useState("");
  const [accountNote, setAccountNote] = useState("");
  const [provisioning, setProvisioning] =
    useState<StaffProvisioningAvailability | null>(null);
  const [copied, setCopied] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<{
      summary: OrganizationSummary | null;
      invites: OrganizationInvite[];
      provisioning: StaffProvisioningAvailability | null;
      error: string | null;
    }> {
      const summaryResponse = await fetch("/api/organizations/current", {
        cache: "no-store",
      });

      if (!summaryResponse.ok) {
        const data = (await summaryResponse.json().catch(() => null)) as {
          error?: string;
        } | null;

        return {
          summary: null,
          invites: [],
          provisioning: null,
          error: actionErrorMessage(summaryResponse.status, data?.error),
        };
      }

      const summaryData = (await summaryResponse.json()) as OrganizationSummary;

      // The invites endpoint is manager-only; asking for it as an employee would only produce a
      // 403 to explain away, and the screen already knows the answer (no visible code).
      if (!summaryData.code) {
        return {
          summary: summaryData,
          invites: [],
          provisioning: null,
          error: null,
        };
      }

      // SCRUM-52: the "Tạo tài khoản" form is only offered when the Edge Function can actually be
      // used, and the probe says *why* when it cannot (not deployed / not allowed / misconfigured).
      const availabilityResponse = await fetch("/api/organizations/accounts", {
        cache: "no-store",
      });
      const provisioning = availabilityResponse.ok
        ? ((await availabilityResponse.json()) as StaffProvisioningAvailability)
        : null;

      const invitesResponse = await fetch("/api/organizations/invites", {
        cache: "no-store",
      });

      if (!invitesResponse.ok) {
        const data = (await invitesResponse.json().catch(() => null)) as {
          error?: string;
        } | null;

        return {
          summary: summaryData,
          invites: [],
          provisioning,
          error: actionErrorMessage(invitesResponse.status, data?.error),
        };
      }

      return {
        summary: summaryData,
        invites: (await invitesResponse.json()) as OrganizationInvite[],
        provisioning,
        error: null,
      };
    }

    load()
      .then((result) => {
        if (cancelled) {
          return;
        }

        setSummary(result.summary);
        setInvites(result.invites);
        setProvisioning(result.provisioning);
        setNameDraft(result.summary?.organization?.name ?? "");
        setPageError(result.error ?? "");
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setSummary(null);
        setInvites([]);
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

  /** The code is visible to the OWNER only, so its presence is the owner test on this screen. */
  const canManage = Boolean(summary?.code);

  const organizationName = summary?.organization?.name ?? "";

  async function copyCode() {
    if (!summary?.code) {
      return;
    }

    try {
      await navigator.clipboard.writeText(summary.code);
      setCopied(true);
      setNote("Đã sao chép mã tham gia.");
    } catch {
      setNote("Trình duyệt không cho phép sao chép tự động — hãy chọn mã và sao chép thủ công.");
    }
  }

  async function renameOrganization() {
    if (busy || !nameDraft.trim()) {
      return;
    }

    setBusy("name");
    setPageError("");
    setNote("");

    try {
      const response = await fetch("/api/organizations/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameDraft.trim() }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setPageError(actionErrorMessage(response.status, data?.error));
        return;
      }

      setNote("Đã lưu tên tổ chức.");
      refresh();
    } catch {
      setPageError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setBusy("");
    }
  }

  async function rotateCode() {
    if (busy) {
      return;
    }

    setBusy("code");
    setPageError("");
    setNote("");

    try {
      const response = await fetch("/api/organizations/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotate_code: true }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setPageError(actionErrorMessage(response.status, data?.error));
        return;
      }

      setNote("Đã đổi mã tham gia. Mã cũ không còn hiệu lực.");
      refresh();
    } catch {
      setPageError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setBusy("");
    }
  }

  async function createInvite() {
    if (busy || !inviteEmail.trim()) {
      return;
    }

    setBusy("invite");
    setPageError("");
    setNote("");

    try {
      const response = await fetch("/api/organizations/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          full_name: inviteFullName.trim() || null,
          role: inviteRole,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setPageError(actionErrorMessage(response.status, data?.error));
        return;
      }

      setInviteEmail("");
      setInviteFullName("");
      setInviteRole("EMPLOYEE");
      setNote("Đã thêm vào danh sách. Người này dùng mã tham gia để vào tổ chức.");
      refresh();
    } catch {
      setPageError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setBusy("");
    }
  }

  async function revokeInvite(id: string) {
    if (busy) {
      return;
    }

    setBusy("revoke");
    setPageError("");
    setNote("");

    try {
      const response = await fetch(`/api/organizations/invites/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setPageError(actionErrorMessage(response.status, data?.error));
        return;
      }

      setNote("Đã hủy lời mời.");
      refresh();
    } catch {
      setPageError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setBusy("");
    }
  }

  async function createStaffAccount() {
    if (
      busy ||
      !accountEmail.trim() ||
      accountPassword.length < MIN_PASSWORD_LENGTH
    ) {
      return;
    }

    setBusy("account");
    setPageError("");
    setNote("");
    setAccountError("");
    setAccountNote("");

    try {
      const response = await fetch("/api/organizations/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: accountEmail.trim(),
          full_name: accountFullName.trim() || null,
          role: accountRole,
          password: accountPassword,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setAccountError(accountErrorMessage(response.status, data?.error));
        return;
      }

      setAccountNote(
        `Đã tạo tài khoản cho ${accountEmail.trim()}. Hãy trao email và mật khẩu tạm cho nhân viên — hệ thống không lưu lại mật khẩu này.`,
      );
      setAccountEmail("");
      setAccountFullName("");
      setAccountRole("EMPLOYEE");
      setAccountPassword("");
      setAccountPasswordVisible(false);
      refresh();
    } catch {
      setAccountError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" />
        Đang tải thông tin tổ chức...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Tổ chức / SCRUM-51
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          {organizationName || "Tổ chức"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Mã tham gia, danh sách tài khoản đã đăng ký và vai trò của thành viên trong tổ chức.
        </p>
      </div>

      {pageError && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle size={16} />
          {pageError}
        </div>
      )}

      {note && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <Check size={16} />
          {note}
        </div>
      )}

      {!summary?.organization ? (
        <div className="rounded-2xl border border-slate-200/80 bg-surface p-6 text-sm text-slate-600 shadow-sm">
          <p className="font-semibold text-slate-800">Bạn chưa thuộc tổ chức nào</p>
          <p className="mt-1">
            Hãy tạo tổ chức mới hoặc tham gia bằng mã tham gia. Hệ thống sẽ tự đưa bạn tới màn hình
            bắt đầu sau khi đăng nhập lại.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Thành viên
                </p>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-primary">
                  <Users size={16} />
                </span>
              </div>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {summary.member_count}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                Tài khoản đã vào tổ chức (kể cả đã nghỉ việc)
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Lời mời chờ
                </p>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <Mail size={16} />
                </span>
              </div>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {summary.pending_invite_count}
              </p>
              <p className="mt-1 text-[10px] text-amber-600">
                Chưa dùng mã tham gia để vào tổ chức
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Vai trò của bạn
                </p>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <ShieldCheck size={16} />
                </span>
              </div>
              <p className="mt-2 text-lg font-bold text-slate-900">
                {canManage ? "Quản lý tổ chức" : "Thành viên"}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                {canManage
                  ? "Xem được mã tham gia và danh sách tài khoản"
                  : "Liên hệ chủ sở hữu nếu cần thêm nhân viên"}
              </p>
            </div>
          </div>

          <section className="rounded-2xl border border-slate-200/80 bg-surface p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
                  <Landmark size={18} />
                </span>
                <div>
                  <h2 className="font-bold text-slate-900">Tên tổ chức</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Tên hiển thị trên thanh điều hướng và trong các báo cáo nội bộ.
                  </p>
                </div>
              </div>
            </div>

            {canManage ? (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  className={inputClassName}
                  aria-label="Tên tổ chức"
                />
                <button
                  type="button"
                  onClick={() => void renameOrganization()}
                  disabled={
                    busy !== "" ||
                    !nameDraft.trim() ||
                    nameDraft.trim() === organizationName
                  }
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === "name" ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Check size={15} />
                  )}
                  Lưu tên
                </button>
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {organizationName}
              </p>
            )}
          </section>

          {canManage ? (
            <>
            <section className="rounded-2xl border border-slate-200/80 bg-surface p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <KeyRound size={18} />
                  </span>
                  <div>
                    <h2 className="font-bold text-slate-900">Mã tham gia</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Chia sẻ mã này cho nhân viên đã có tên trong danh sách bên dưới. Người ngoài
                      biết mã vẫn không vào được.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <p className="flex-1 rounded-lg border border-dashed border-slate-300 bg-app px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.3em] text-slate-900 sm:text-left">
                  {summary.code}
                </p>
                <button
                  type="button"
                  onClick={() => void copyCode()}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? "Đã sao chép" : "Sao chép"}
                </button>
                <button
                  type="button"
                  onClick={() => void rotateCode()}
                  disabled={busy !== ""}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
                >
                  {busy === "code" ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <RefreshCw size={15} />
                  )}
                  Đổi mã
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Đổi mã chỉ ảnh hưởng người chưa vào tổ chức — thành viên đã vào vẫn giữ nguyên.
              </p>
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-surface p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
                  <KeyRound size={18} />
                </span>
                <div>
                  <h2 className="font-bold text-slate-900">
                    Tạo tài khoản cho nhân viên (mật khẩu tạm)
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Dành cho nhân viên chưa có tài khoản. Bạn đặt mật khẩu tạm, trao tận tay cho
                    họ; họ đăng nhập, đổi mật khẩu rồi dùng mã tham gia để vào tổ chức.
                  </p>
                </div>
              </div>

              {provisioning?.available ? (
                <>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-semibold text-slate-600">
                      Email
                      <input
                        type="email"
                        value={accountEmail}
                        onChange={(event) => setAccountEmail(event.target.value)}
                        placeholder="nhanvien@humora.vn"
                        className={`mt-1 ${inputClassName}`}
                      />
                    </label>
                    <label className="block text-xs font-semibold text-slate-600">
                      Họ tên
                      <input
                        value={accountFullName}
                        onChange={(event) => setAccountFullName(event.target.value)}
                        placeholder="Nguyễn Văn A"
                        className={`mt-1 ${inputClassName}`}
                      />
                    </label>
                    <label className="block text-xs font-semibold text-slate-600">
                      Vai trò khi vào tổ chức
                      <select
                        value={accountRole}
                        onChange={(event) => setAccountRole(event.target.value)}
                        className={`mt-1 ${inputClassName}`}
                      >
                        {INVITE_ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {roleLabel(role)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-semibold text-slate-600">
                      Mật khẩu tạm (tối thiểu {MIN_PASSWORD_LENGTH} ký tự)
                      <span className="mt-1 flex items-center gap-2">
                        <input
                          type={accountPasswordVisible ? "text" : "password"}
                          value={accountPassword}
                          onChange={(event) => setAccountPassword(event.target.value)}
                          autoComplete="off"
                          className={inputClassName}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setAccountPasswordVisible((value) => !value)
                          }
                          className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          {accountPasswordVisible ? "Ẩn" : "Hiện"}
                        </button>
                      </span>
                    </label>
                  </div>

                  {accountError && (
                    <div
                      role="alert"
                      className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
                    >
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                      <span>{accountError}</span>
                    </div>
                  )}

                  {accountNote && (
                    <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      <Check size={16} className="mt-0.5 shrink-0" />
                      <span>{accountNote}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void createStaffAccount()}
                    disabled={
                      busy !== "" ||
                      !accountEmail.trim() ||
                      accountPassword.length < MIN_PASSWORD_LENGTH
                    }
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === "account" ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <KeyRound size={15} />
                    )}
                    Tạo tài khoản
                  </button>

                  <p className="mt-2 text-[11px] text-slate-500">
                    Hệ thống không lưu mật khẩu tạm. Nếu quên, hãy đặt lại mật khẩu cho tài khoản
                    đó ở bước sau.
                  </p>
                </>
              ) : (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{provisioningNote(provisioning)}</span>
                </div>
              )}
            </section>
            </>
          ) : null}

          {canManage ? (
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-surface shadow-sm">
              <div className="border-b border-slate-100 p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                    <UserPlus size={18} />
                  </span>
                  <div>
                    <h2 className="font-bold text-slate-900">
                      Tài khoản đã đăng ký trong tổ chức
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Thêm email của nhân viên đã có tài khoản. Họ giữ mật khẩu riêng và dùng mã
                      tham gia ở trên để vào tổ chức. Vai trò tối đa là quản lý chi nhánh.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <label className="block text-xs font-semibold text-slate-600">
                    Email
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="nhanvien@humora.vn"
                      className={`mt-1 ${inputClassName}`}
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-600">
                    Họ tên (không bắt buộc)
                    <input
                      value={inviteFullName}
                      onChange={(event) => setInviteFullName(event.target.value)}
                      placeholder="Nguyễn Văn A"
                      className={`mt-1 ${inputClassName}`}
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-600">
                    Vai trò khi vào tổ chức
                    <select
                      value={inviteRole}
                      onChange={(event) => setInviteRole(event.target.value)}
                      className={`mt-1 ${inputClassName}`}
                    >
                      {INVITE_ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {roleLabel(role)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => void createInvite()}
                  disabled={busy !== "" || !inviteEmail.trim()}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === "invite" ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <UserPlus size={15} />
                  )}
                  Thêm vào danh sách
                </button>
              </div>

              {invites.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">
                  Chưa có tài khoản nào trong danh sách. Nhân viên tự đăng ký ở trang Đăng ký, sau
                  đó bạn thêm email của họ ở đây.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Email</th>
                        <th className="px-4 py-3 font-semibold">Họ tên</th>
                        <th className="px-4 py-3 font-semibold">Vai trò</th>
                        <th className="px-4 py-3 font-semibold">Trạng thái</th>
                        <th className="px-4 py-3 font-semibold">Thêm lúc</th>
                        <th className="px-4 py-3 font-semibold">Hành động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invites.map((invite) => (
                        <tr key={invite.id}>
                          <td className="px-4 py-3 font-medium text-slate-800">
                            {invite.email}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {invite.full_name ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {roleLabel(invite.role)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                                invite.claimed_by
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {invite.claimed_by ? "Đã vào tổ chức" : "Chờ vào tổ chức"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {formatDateTime(invite.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            {invite.claimed_by ? (
                              <span className="text-[11px] text-slate-400">Đã dùng</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void revokeInvite(invite.id)}
                                disabled={busy !== ""}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-[11px] font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
                              >
                                <Trash2 size={13} />
                                Hủy
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-surface-accent p-4">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
              <div className="text-xs text-slate-600">
                <p className="font-semibold text-slate-800">
                  Danh sách tài khoản chỉ hiển thị cho quản lý
                </p>
                <p className="mt-1">
                  Bạn đang là thành viên của tổ chức. Ai cần thêm nhân viên hãy liên hệ chủ sở hữu
                  hoặc quản lý chi nhánh.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}