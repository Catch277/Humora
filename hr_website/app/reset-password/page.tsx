"use client";

import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import PasswordInput from "@/components/PasswordInput";
import { useLocale } from "@/components/LocaleProvider";
import type { Translate } from "@/lib/i18n/translate";

const MIN_PASSWORD_LENGTH = 8;

/**
 * The screen is reached only through `GET /api/auth/recovery`, which has already turned the emailed
 * link into a recovery session, so its two failures are the two the reader can act on: a password that
 * is too short, and a session that is gone (a link used in another browser, or one already spent).
 * The server sentence is deliberately not echoed — it names the same two things and would read in
 * Vietnamese inside an English screen.
 *
 * `t` is last, like every module-level helper on a migrated screen.
 */
function errorMessage(status: number, t: Translate): string {
  if (status === 400) {
    return t("password.minLength", { min: MIN_PASSWORD_LENGTH });
  }

  return t("resetPassword.error.failed");
}

export default function ResetPasswordPage() {
  const { t } = useLocale();
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
      setError(t("password.minLength", { min: MIN_PASSWORD_LENGTH }));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("error.passwordMismatch"));
      return;
    }

    setSubmitting(true);

    try {
      // The same endpoint `/change-password` uses: it replaces the caller's password through Supabase
      // Auth with their own session and clears `must_change_password`, which is exactly what a
      // recovery session is allowed to do.
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setError(errorMessage(response.status, t));
        return;
      }

      // The recovery session is a normal one by now, so the gate decides where the account belongs.
      router.replace("/");
      router.refresh();
    } catch {
      setError(t("error.network"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 py-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {t("resetPassword.eyebrow")}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          {t("resetPassword.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("resetPassword.subtitle")}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-slate-200/80 bg-surface p-5 shadow-sm"
      >
        <label className="block text-xs font-semibold text-slate-600">
          {t("password.new")}
          <PasswordInput
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
          />
          <span className="mt-1 block text-[10px] font-normal text-slate-400">
            {t("password.minLength", { min: MIN_PASSWORD_LENGTH })}
          </span>
        </label>

        <label className="block text-xs font-semibold text-slate-600">
          {t("password.confirm")}
          <PasswordInput
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
          />
        </label>

        <button
          type="submit"
          disabled={submitting || !password || !confirmPassword}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting && <Loader2 size={15} className="animate-spin" />}
          {submitting ? t("common.saving") : t("password.save")}
        </button>
      </form>

      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-surface-accent p-4">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
        <p className="text-xs text-slate-600">
          {t("resetPassword.note")}
        </p>
      </div>
    </div>
  );
}
