"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";

import PasswordInput from "@/components/PasswordInput";
import { useLocale } from "@/components/LocaleProvider";
import type { Translate } from "@/lib/i18n/translate";

const MIN_PASSWORD_LENGTH = 8;

/**
 * `t` is last, like every module-level helper on a migrated screen: a function outside the component has
 * no hook, so the component hands it the translator.
 */
function errorMessage(
  status: number,
  serverMessage: string | undefined,
  t: Translate,
): string {
  if (status === 401) {
    return t("error.sessionExpired");
  }

  if (status === 400) {
    return t("password.minLength", { min: MIN_PASSWORD_LENGTH });
  }

  return serverMessage ?? t("changePassword.error.failed");
}

export default function ChangePasswordPage() {
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
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(errorMessage(response.status, data?.error, t));
        return;
      }

      // The flag is cleared, so the gate now sends this account to onboarding (join the
      // organization with the code) or straight to the dashboard.
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
          {t("changePassword.eyebrow")}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          {t("changePassword.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("changePassword.subtitle")}
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
          {t("password.new")}
          <PasswordInput
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
          />
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
          {t("changePassword.note")}
        </p>
      </div>
    </div>
  );
}