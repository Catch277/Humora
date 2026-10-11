"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, KeyRound, Loader2, ShieldCheck } from "lucide-react";

const MIN_PASSWORD_LENGTH = 8;

function errorMessage(status: number, serverMessage?: string): string {
  if (status === 401) {
    return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  }

  if (status === 400) {
    return `Mật khẩu mới cần tối thiểu ${MIN_PASSWORD_LENGTH} ký tự.`;
  }

  return serverMessage ?? "Không đổi được mật khẩu. Vui lòng thử lại.";
}

const inputClassName =
  "w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-500/15";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setError("");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Mật khẩu mới cần tối thiểu ${MIN_PASSWORD_LENGTH} ký tự.`);
      return;
    }

    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(errorMessage(response.status, data?.error));
        return;
      }

      // The flag is cleared, so the gate now sends this account to onboarding (join the
      // organization with the code) or straight to the dashboard.
      router.replace("/");
      router.refresh();
    } catch {
      setError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 py-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Bảo mật / SCRUM-52
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Đổi mật khẩu</h1>
        <p className="mt-1 text-sm text-slate-500">
          Tài khoản của bạn được chủ sở hữu tạo với mật khẩu tạm. Hãy đặt mật khẩu riêng của bạn
          trước khi tiếp tục.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-slate-200/80 bg-surface p-5 shadow-sm"
      >
        <label className="block text-xs font-semibold text-slate-600">
          Mật khẩu mới
          <div className="relative mt-1">
            <KeyRound
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              className={inputClassName}
            />
          </div>
        </label>

        <label className="block text-xs font-semibold text-slate-600">
          Xác nhận mật khẩu mới
          <div className="relative mt-1">
            <KeyRound
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              className={inputClassName}
            />
          </div>
        </label>

        <button
          type="submit"
          disabled={submitting || !password || !confirmPassword}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting && <Loader2 size={15} className="animate-spin" />}
          {submitting ? "Đang lưu..." : "Lưu mật khẩu mới"}
        </button>
      </form>

      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-surface-accent p-4">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
        <p className="text-xs text-slate-600">
          Mật khẩu tạm chỉ dùng một lần. Sau khi đổi, mật khẩu cũ không còn hiệu lực.
        </p>
      </div>
    </div>
  );
}