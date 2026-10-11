"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  KeyRound,
  Landmark,
  Loader2,
  ShieldCheck,
  Users,
} from "lucide-react";

type OrganizationSummary = {
  organization: { id: string; name: string } | null;
  member_count: number;
  pending_invite_count: number;
};

const MIN_NAME_LENGTH = 2;

/**
 * Vietnamese copy for the join failures. `403` covers two very different cases, and the difference
 * matters to the person typing the code, so it is read from the message the API documents
 * (`organizationErrorResponse` maps both to 403, the wording comes from the domain errors).
 */
function createErrorMessage(status: number, serverMessage?: string): string {
  if (status === 401) {
    return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  }

  if (status === 409) {
    return "Tài khoản này đã thuộc một tổ chức rồi.";
  }

  if (status === 429) {
    return "Bạn đã nhập sai mã quá nhiều lần. Vui lòng thử lại sau một giờ.";
  }

  if (status === 400) {
    return `Tên tổ chức cần từ ${MIN_NAME_LENGTH} ký tự trở lên.`;
  }

  return serverMessage ?? "Không tạo được tổ chức. Vui lòng thử lại.";
}

function joinErrorMessage(status: number, serverMessage?: string): string {
  if (status === 401) {
    return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  }

  if (status === 409) {
    return "Tài khoản này đã thuộc một tổ chức rồi.";
  }

  if (status === 429) {
    return "Bạn đã nhập sai mã quá nhiều lần. Vui lòng thử lại sau một giờ.";
  }

  if (status === 403) {
    return serverMessage && serverMessage.toLowerCase().includes("code")
      ? "Mã tham gia không đúng. Hãy kiểm tra lại mã mà chủ sở hữu đã chia sẻ."
      : "Tài khoản này chưa được tổ chức đăng ký. Hãy nhờ chủ sở hữu tạo tài khoản hoặc gửi lời mời cho email của bạn.";
  }

  if (status === 400) {
    return "Mã tham gia không hợp lệ. Mã gồm 8 ký tự chữ và số.";
  }

  return serverMessage ?? "Không tham gia được tổ chức. Vui lòng thử lại.";
}

const inputClassName =
  "w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-500/15";

export default function OnboardingPage() {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | "">("");
  const [error, setError] = useState("");

  // Landing here with an organization already (a stale back-button, two tabs) should not show the
  // onboarding cards; proxy.ts sends those requests to "/", this covers the client-side case.
  useEffect(() => {
    let cancelled = false;

    fetch("/api/organizations/current", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: OrganizationSummary | null) => {
        if (!cancelled && data?.organization) {
          router.replace("/");
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function createOrganization() {
    if (busy) {
      return;
    }

    setBusy("create");
    setError("");

    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: organizationName.trim() }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(createErrorMessage(response.status, data?.error));
        return;
      }

      router.replace("/organization");
      router.refresh();
    } catch {
      setError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setBusy("");
    }
  }

  async function joinOrganization() {
    if (busy) {
      return;
    }

    setBusy("join");
    setError("");

    try {
      const response = await fetch("/api/organizations/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(joinErrorMessage(response.status, data?.error));
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Bắt đầu / SCRUM-51
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Tổ chức của bạn</h1>
        <p className="mt-1 text-sm text-slate-500">
          Tài khoản này chưa thuộc tổ chức nào. Hãy tạo tổ chức của riêng bạn — bạn sẽ là chủ sở
          hữu — hoặc tham gia tổ chức đã có bằng mã tham gia.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col rounded-2xl border border-slate-200/80 bg-surface p-5 shadow-sm">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-primary">
            <Landmark size={20} />
          </span>
          <h2 className="mt-4 font-bold text-slate-900">Tạo tổ chức mới</h2>
          <p className="mt-1 flex-1 text-xs text-slate-500">
            Dành cho chủ doanh nghiệp: tên chuỗi cà phê, công ty của bạn. Sau khi tạo, bạn là chủ sở
            hữu và nhận mã tham gia để chia sẻ cho nhân viên.
          </p>
          <label className="mt-4 block text-xs font-semibold text-slate-600">
            Tên tổ chức
            <input
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              placeholder="Ví dụ: Humora Coffee"
              className={`mt-1 ${inputClassName}`}
            />
          </label>
          <button
            type="button"
            onClick={() => void createOrganization()}
            disabled={busy !== "" || organizationName.trim().length < MIN_NAME_LENGTH}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "create" ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Landmark size={15} />
            )}
            Tạo tổ chức
          </button>
        </section>

        <section className="flex flex-col rounded-2xl border border-slate-200/80 bg-surface p-5 shadow-sm">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <KeyRound size={20} />
          </span>
          <h2 className="mt-4 font-bold text-slate-900">Tham gia bằng mã</h2>
          <p className="mt-1 flex-1 text-xs text-slate-500">
            Dành cho nhân viên đã được chủ sở hữu đăng ký tài khoản. Mã tham gia chỉ dùng được khi
            email của bạn đã có trong danh sách của tổ chức.
          </p>
          <label className="mt-4 block text-xs font-semibold text-slate-600">
            Mã tham gia
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="Ví dụ: K7QM2XPD"
              className={`mt-1 font-mono tracking-widest ${inputClassName}`}
            />
          </label>
          <button
            type="button"
            onClick={() => void joinOrganization()}
            disabled={busy !== "" || code.trim().length < 6}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "join" ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <KeyRound size={15} />
            )}
            Tham gia tổ chức
          </button>
        </section>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-surface-accent p-4">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
        <div className="text-xs text-slate-600">
          <p className="font-semibold text-slate-800">Vì sao cần cả mã và danh sách đăng ký?</p>
          <p className="mt-1">
            Mã tham gia có thể bị lộ. Vì vậy hệ thống kiểm tra thêm một điều kiện: email của bạn phải
            có trong danh sách tài khoản mà tổ chức đã đăng ký. Người ngoài dù biết mã vẫn không vào
            được. Chủ sở hữu có thể đổi mã bất cứ lúc nào trong mục{" "}
            <span className="font-medium">Tổ chức</span>.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Users size={14} />
        Nếu bạn cho rằng mình đã được đăng ký, hãy nhờ chủ sở hữu kiểm tra lại đúng địa chỉ email.
      </div>
    </div>
  );
}
