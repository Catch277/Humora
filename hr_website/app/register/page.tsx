"use client";

import {
  CheckCircle2,
  Loader2,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import BrandMark from "@/components/BrandMark";
import LanguageToggle from "@/components/LanguageToggle";
import PasswordInput from "@/components/PasswordInput";
import { useLocale } from "@/components/LocaleProvider";
import type { Translate } from "@/lib/i18n/translate";

type SignUpResponse = {
  userId: string;
  email: string;
  emailConfirmationRequired: boolean;
};

/** Minimum length enforced by `SignUpUseCase` via `lib/usecases/credentials.ts`. */
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
  if (status === 409) {
    return t("register.error.emailTaken");
  }

  if (status === 400) {
    return t("register.error.invalid", { min: MIN_PASSWORD_LENGTH });
  }

  return serverMessage ?? t("register.error.failed");
}

const inputClassName =
  "w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-blue-500/15";

export default function RegisterPage() {
  const { t } = useLocale();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Set when the account was created but Supabase requires the confirmation email first.
  const [confirmationEmail, setConfirmationEmail] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setError("");

    if (password !== confirmPassword) {
      setError(t("error.passwordMismatch"));
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The HTTP boundary names the field after the `users` column.
        body: JSON.stringify({ email, password, full_name: fullName }),
      });

      if (!response.ok) {
        const data: { error?: string } | null = await response
          .json()
          .catch(() => null);

        setError(errorMessage(response.status, data?.error, t));
        setSubmitting(false);
        return;
      }

      const result = (await response.json()) as SignUpResponse;

      if (result.emailConfirmationRequired) {
        setConfirmationEmail(result.email);
        setSubmitting(false);
        return;
      }

      // A session was created, so the account is immediately usable.
      router.replace("/");
      router.refresh();
    } catch {
      setError(t("error.network"));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[75vh] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-surface p-6 shadow-sm sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandMark className="h-9 w-9" />
            <div className="leading-tight">
              <p className="text-sm font-bold text-slate-900">Humora</p>
              <p className="mt-0.5 text-[10px] font-medium text-slate-500">
                HR &amp; Shift Intelligence
              </p>
            </div>
          </div>
          {/* Public path: the shell header returns null here, so the switch has to live on the screen. */}
          <LanguageToggle />
        </div>

        {confirmationEmail ? (
          <div className="mt-6">
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">{t("register.created")}</p>
                <p className="mt-1">
                  {t("register.confirmSentBefore")}
                  <span className="font-medium">{confirmationEmail}</span>
                  {t("register.confirmSentAfter")}
                </p>
              </div>
            </div>

            <Link
              href="/login"
              className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong"
            >
              {t("register.backToLogin")}
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-6 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {t("register.eyebrow")}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              {t("register.title")}
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              {t("register.subtitleBefore")}
              <span className="font-medium text-slate-700">
                {t("role.employee")}
              </span>
              {t("register.subtitleAfter")}
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <label className="block text-xs font-semibold text-slate-600">
                {t("common.fullName")}
                <div className="relative mt-1">
                  <UserRound
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    name="full_name"
                    autoComplete="name"
                    required
                    maxLength={120}
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder={t("common.fullNamePlaceholder")}
                    className={inputClassName}
                  />
                </div>
              </label>

              <label className="block text-xs font-semibold text-slate-600">
                {t("common.email")}
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
                    placeholder={t("common.emailPlaceholder")}
                    className={inputClassName}
                  />
                </div>
              </label>

              <label className="block text-xs font-semibold text-slate-600">
                {t("common.password")}
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  name="password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                />
                <span className="mt-1 block text-[10px] font-normal text-slate-400">
                  {t("register.passwordHint", { min: MIN_PASSWORD_LENGTH })}
                </span>
              </label>

              <label className="block text-xs font-semibold text-slate-600">
                {t("register.confirmPassword")}
                <PasswordInput
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  name="confirm_password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                />
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
                    {t("register.submitting")}
                  </>
                ) : (
                  t("register.title")
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-slate-500">
              {t("register.haveAccount")}{" "}
              <Link
                href="/login"
                className="font-semibold text-primary hover:underline"
              >
                {t("login.title")}
              </Link>
            </p>
          </>
        )}

        <p className="mt-6 flex items-center gap-1.5 text-[10px] text-slate-400">
          <ShieldCheck size={12} className="text-primary" />
          {t("register.authNote")}
        </p>
      </div>
    </div>
  );
}
