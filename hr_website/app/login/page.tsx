"use client";

import { KeyRound, Loader2, Mail, ScanFace, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { passkeyErrorMessage } from "@/lib/domain/passkeyMessages";
import { getBrowserSupabaseClient } from "@/lib/infrastructure/browserSupabaseClient";

/**
 * Whether this browser can run a WebAuthn ceremony — what the passkey button below starts. Every browser
 * this app targets has it, so the answer is asked at press time rather than from an effect (which React
 * 19 warns about) and a browser without it gets a sentence instead of a button that does nothing.
 */
function supportsWebAuthn(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined"
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [passkeySubmitting, setPasskeySubmitting] = useState(false);
  const [passkeyError, setPasskeyError] = useState("");

  /**
   * Quick login (SCRUM-79): signs the account in with the passkey it registered on `/security`. The
   * browser client is used instead of `/api/auth/sign-in` because the ceremony cannot leave the browser;
   * it writes the same session cookies the server reads, so the redirect below is all that is left.
   */
  async function handlePasskeySignIn() {
    if (submitting || passkeySubmitting) {
      return;
    }

    setError("");
    setPasskeyError("");
    if (!supportsWebAuthn()) {
      setPasskeyError("Trình duyệt này không hỗ trợ Passkey (WebAuthn).");
      return;
    }

    setPasskeySubmitting(true);

    try {
      const supabase = getBrowserSupabaseClient();
      const { data, error: passkeyFailure } =
        await supabase.auth.signInWithPasskey();

      if (passkeyFailure || !data.session) {
        setPasskeyError(
          passkeyFailure
            ? passkeyErrorMessage(passkeyFailure)
            : "Không mở được phiên làm việc. Vui lòng thử lại.",
        );
        setPasskeySubmitting(false);
        return;
      }

      // Same landing as the password path, and `replace` keeps this screen out of the history.
      router.replace(resolveRedirectTarget());
      router.refresh();
    } catch (passkeyFailure) {
      setPasskeyError(passkeyErrorMessage(passkeyFailure));
      setPasskeySubmitting(false);
    }
  }

  /** Only same-origin relative paths are honoured, so `?next=` cannot bounce the user off-site. */
  function resolveRedirectTarget(): string {
    const next = new URLSearchParams(window.location.search).get("next");

    if (next && next.startsWith("/") && !next.startsWith("//")) {
      return next;
    }

    return "/";
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data: { error?: string } | null = await response
          .json()
          .catch(() => null);

        setError(
          response.status === 401
            ? "Email hoặc mật khẩu không đúng."
            : (data?.error ?? "Không thể đăng nhập. Vui lòng thử lại."),
        );
        setSubmitting(false);
        return;
      }

      // `replace` keeps the login screen out of the history so Back does not return to it.
      router.replace(resolveRedirectTarget());
      router.refresh();
    } catch {
      setError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[75vh] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-surface p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white shadow-sm shadow-blue-200">
            H
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold text-slate-900">Humora</p>
            <p className="mt-0.5 text-[10px] font-medium text-slate-500">
              HR &amp; Shift Intelligence
            </p>
          </div>
        </div>

        <p className="mt-6 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Hệ thống quản lý
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          Đăng nhập
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          Sử dụng tài khoản nội bộ để truy cập bảng điều khiển nhân sự.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-xs font-semibold text-slate-600">
            Email
            <div className="relative mt-1">
              <Mail
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ten@humora.vn"
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-blue-500/15"
              />
            </div>
          </label>

          <label className="block text-xs font-semibold text-slate-600">
            Mật khẩu
            <div className="relative mt-1">
              <KeyRound
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-blue-500/15"
              />
            </div>
          </label>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Đang đăng nhập...
              </>
            ) : (
              "Đăng nhập"
            )}
          </button>
        </form>

      <div className="mt-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          hoặc
        </span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      {passkeyError && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
        >
          {passkeyError}
        </div>
      )}

      <button
        type="button"
        onClick={() => void handlePasskeySignIn()}
        disabled={submitting || passkeySubmitting}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-surface px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {passkeySubmitting ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <ScanFace size={14} className="text-primary" />
        )}
        {passkeySubmitting ? "Đang chờ thiết bị..." : "Đăng nhập bằng Face ID"}
      </button>

      <p className="mt-2 text-center text-[10px] text-slate-400">
        Chỉ dùng được trên thiết bị bạn đã bật Passkey ở trang Bảo mật.
      </p>


        <p className="mt-6 text-center text-xs text-slate-500">
          Chưa có tài khoản?{" "}
          <Link
            href="/register"
            className="font-semibold text-primary hover:underline"
          >
            Đăng ký ngay
          </Link>
        </p>

        <p className="mt-6 flex items-center gap-1.5 text-[10px] text-slate-400">
          <ShieldCheck size={12} className="text-primary" />
          Phiên làm việc được bảo vệ bằng Supabase Auth.
        </p>
      </div>
    </div>
  );
}
