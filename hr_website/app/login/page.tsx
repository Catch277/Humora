"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  ScanFace,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import BrandMark from "@/components/BrandMark";
import BrandTagline from "@/components/BrandTagline";
import LanguageToggle from "@/components/LanguageToggle";
import PasswordInput from "@/components/PasswordInput";
import { useLocale } from "@/components/LocaleProvider";
import { passkeyErrorMessage } from "@/lib/domain/passkeyMessages";
import { offerToBrowserPasswordManager } from "@/lib/infrastructure/browserPasswordManager";
import { getBrowserSupabaseClient } from "@/lib/infrastructure/browserSupabaseClient";
import { writeStoredSessionScope } from "@/lib/infrastructure/sessionScope";
import { errorMessageFor } from "@/lib/i18n/serverMessages";
import type { MessageKey } from "@/lib/i18n/translate";

/**
 * Where "Ghi nhớ đăng nhập" keeps the address of the last remembered sign-in — never a password. The value
 * is a convenience for the next visit only; the session itself is the Supabase refresh token in its own
 * cookies, whose lifetime `lib/infrastructure/sessionScope.ts` decides.
 */
const REMEMBERED_EMAIL_KEY = "humora-login-email";

/** Storage can be blocked (private mode, a locked-down profile): then the form simply starts empty. */
function readRememberedEmail(): string {
  try {
    return window.localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

function storeRememberedEmail(email: string, remember: boolean): void {
  try {
    if (remember) {
      window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    } else {
      window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }
  } catch {
    /* Storage bị chặn: lần sau chỉ cần nhập lại email. */
  }
}

/**
 * What `/api/auth/forgot-password` can answer with. The route sends a Vietnamese sentence of its own
 * (the API contract stays Vietnamese for the mobile app), so the screen restates the three failures
 * it can act on in the reader's language rather than echoing it: a malformed address, the Supabase
 * rate limit on recovery mail, and a send failure.
 */
const FORGOT_STATUS_MESSAGES: Readonly<Record<number, MessageKey>> = {
  400: "error.invalidRequest",
  429: "login.error.forgotRateLimited",
  500: "login.error.forgotFailed",
};

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
  const { t } = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  /**
   * "Ghi nhớ đăng nhập": on by default, which is the behaviour the app already had (the session cookie
   * outlived the browser). It never stores the password — it decides how long the Supabase cookies live
   * (`lib/infrastructure/sessionScope.ts`) and whether the address is filled in next time.
   */
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [passkeySubmitting, setPasskeySubmitting] = useState(false);
  const [passkeyError, setPasskeyError] = useState("");

  // The "Quên mật khẩu?" panel is a mode of this card rather than a screen of its own: it needs the
  // same email, it is a dead end once the mail is sent, and a visitor who mistyped their password is
  // already looking at the right card.
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotSending, setForgotSending] = useState(false);
  /** The address the mail went to — also the flag that the request succeeded. */
  const [forgotSentTo, setForgotSentTo] = useState("");
  /** Set when `GET /api/auth/recovery` bounced the visitor back with an unusable link. */
  const [recoveryFailed, setRecoveryFailed] = useState(false);
  /** Set when `/reset-password` saved a new password and signed the recovery session out. */
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => {
    // `window.location.search` is not readable during render (the server has no URL to read), so the
    // flag arrives after mount. The update sits in a promise callback rather than in the effect body:
    // React 19's `react-hooks/set-state-in-effect` refuses a synchronous one (`components/Sidebar.tsx`
    // is the same shape).
    const params = new URLSearchParams(window.location.search);
    const recovery = params.get("recovery");
    const reset = params.get("reset");

    // The address of the last remembered sign-in, so a returning reader only types the password. Read here
    // because storage does not exist during the server render, and applied through a promise callback for
    // the same reason as the flags below.
    const rememberedEmail = readRememberedEmail();

    if (rememberedEmail) {
      void Promise.resolve().then(() => setEmail(rememberedEmail));
    }

    if (recovery === "failed") {
      void Promise.resolve().then(() => setRecoveryFailed(true));
    }

    // `/reset-password` signs the recovery session out and lands here, so the reader sees where to type
    // the password they just chose instead of being dropped on a dashboard.
    if (reset === "success") {
      void Promise.resolve().then(() => setResetDone(true));
    }
  }, []);

  function openForgotMode() {
    // Whatever is already typed is almost always the address they want the mail at.
    setForgotEmail((current) => current || email);
    setForgotError("");
    setForgotSentTo("");
    setForgotOpen(true);
  }

  function closeForgotMode() {
    setForgotOpen(false);
    setForgotError("");
    setForgotSentTo("");
  }

  /** Sends the Supabase recovery mail; the link comes back to `GET /api/auth/recovery`. */
  async function handleForgotSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (forgotSending) {
      return;
    }

    setForgotError("");
    setForgotSending(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setForgotError(
          errorMessageFor(response.status, data, t, FORGOT_STATUS_MESSAGES),
        );
        return;
      }

      const data = (await response.json()) as { email?: string };
      setForgotSentTo(data.email ?? forgotEmail.trim());
    } catch {
      setForgotError(t("error.network"));
    } finally {
      setForgotSending(false);
    }
  }

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
      setPasskeyError(t("login.error.noWebAuthn"));
      return;
    }

    setPasskeySubmitting(true);

    try {
      // The same "ghi nhớ" choice as the password form: the browser client reads this marker before it
      // writes the session cookies, so a passkey login is not the one door that always remembers.
      writeStoredSessionScope(remember ? "device" : "session");

      const supabase = getBrowserSupabaseClient();
      const { data, error: passkeyFailure } =
        await supabase.auth.signInWithPasskey();

      if (passkeyFailure || !data.session) {
        setPasskeyError(
          passkeyFailure
            ? passkeyErrorMessage(passkeyFailure, t)
            : t("login.error.sessionFailed"),
        );
        setPasskeySubmitting(false);
        return;
      }

      // Same landing as the password path, and `replace` keeps this screen out of the history.
      router.replace(resolveRedirectTarget());
      router.refresh();
    } catch (passkeyFailure) {
      setPasskeyError(passkeyErrorMessage(passkeyFailure, t));
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
      // The choice travels as a cookie rather than as a body field: `@supabase/ssr` picks the lifetime of
      // the session cookies when it writes them, and this marker is what every writer consults.
      writeStoredSessionScope(remember ? "device" : "session");

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
            ? t("login.error.invalidCredentials")
            : (data?.error ?? t("login.error.failed")),
        );
        setSubmitting(false);
        return;
      }

      // Only the address, and only when this device was asked to remember: nothing else about the account
      // stays behind, and nothing is ever written for a reader who unticked the box.
      storeRememberedEmail(email.trim(), remember);

      if (remember) {
        // The app keeps no password. This hands the pair to the browser's own manager instead, which is what
        // fills the field next time (see `lib/infrastructure/browserPasswordManager.ts`).
        offerToBrowserPasswordManager(email.trim(), password);
      }

      // `replace` keeps the login screen out of the history so Back does not return to it.
      router.replace(resolveRedirectTarget());
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
              <BrandTagline className="mt-1" />
            </div>
          </div>
          {/* `/login` renders outside the shell (`Header` returns null for a public path), so the switch
              has to live here — otherwise a visitor who has never signed in cannot reach English. */}
          <LanguageToggle />
        </div>

        {recoveryFailed && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
          >
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            {t("login.recoveryFailed")}
          </div>
        )}

        {resetDone && (
          <div
            role="status"
            className="mt-5 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"
          >
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            {t("login.resetSuccess")}
          </div>
        )}

        <p className="mt-6 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {t("nav.sectionLabel")}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          {t("login.title")}
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          {t("login.subtitle")}
        </p>

        {forgotOpen ? (
          <div className="mt-6 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {t("login.forgotTitle")}
              </h2>
              <p className="mt-1 text-xs text-slate-500">{t("login.forgotHint")}</p>
            </div>

            {forgotSentTo ? (
              <div
                role="status"
                className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"
              >
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                <span>
                  {t("login.forgotSent", { email: forgotSentTo })}
                  <span className="mt-1 block text-[10px] text-emerald-700">
                    {t("login.forgotSentHint")}
                  </span>
                </span>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleForgotSubmit}>
                <label className="block text-xs font-semibold text-slate-600">
                  {t("common.email")}
                  <div className="relative mt-1">
                    <Mail
                      size={15}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="email"
                      name="forgot_email"
                      autoComplete="email"
                      required
                      value={forgotEmail}
                      onChange={(event) => setForgotEmail(event.target.value)}
                      placeholder={t("common.emailPlaceholder")}
                      className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-blue-500/15"
                    />
                  </div>
                </label>

                {forgotError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
                  >
                    {forgotError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={forgotSending || forgotEmail.trim() === ""}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {forgotSending && <Loader2 size={14} className="animate-spin" />}
                  {forgotSending ? t("login.forgotSubmitting") : t("login.forgotSubmit")}
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={closeForgotMode}
              className="block w-full text-center text-[11px] font-semibold text-primary hover:underline"
            >
              {t("login.backToLogin")}
            </button>
          </div>
        ) : (
          <>
            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
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
                    className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-blue-500/15"
                  />
                </div>
              </label>

              <label className="block text-xs font-semibold text-slate-600">
                {t("common.password")}
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  name="password"
                  autoComplete="current-password"
                />
              </label>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <label className="flex cursor-pointer items-center gap-2 py-1 text-[11px] font-medium text-slate-600">
                    <input
                      type="checkbox"
                      name="remember"
                      checked={remember}
                      onChange={(event) => setRemember(event.target.checked)}
                      aria-describedby="login-remember-hint"
                      className="h-4 w-4 shrink-0 rounded border-slate-300 accent-primary"
                    />
                    {t("login.rememberMe")}
                  </label>

                  <button
                    type="button"
                    onClick={openForgotMode}
                    className="shrink-0 py-1 text-[11px] font-semibold text-primary hover:underline"
                  >
                    {t("login.forgotLink")}
                  </button>
                </div>
                {/* Says out loud what the box does — and that no password is involved either way. */}
                <p
                  id="login-remember-hint"
                  className="mt-1 text-[10px] text-slate-400"
                >
                  {remember
                    ? t("login.rememberHint")
                    : t("login.sessionHint")}
                </p>
              </div>

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
                    {t("login.submitting")}
                  </>
                ) : (
                  t("login.title")
                )}
              </button>
            </form>

          <div className="mt-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {t("login.or")}
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
            {passkeySubmitting ? t("login.passkeyWaiting") : t("login.passkeyButton")}
          </button>

          <p className="mt-2 text-center text-[10px] text-slate-400">
            {t("login.passkeyHint")}
          </p>
          </>
        )}

        <p className="mt-6 text-center text-xs text-slate-500">
          {t("login.noAccount")}{" "}
          <Link
            href="/register"
            className="font-semibold text-primary hover:underline"
          >
            {t("login.registerLink")}
          </Link>
        </p>

        <p className="mt-6 flex items-center gap-1.5 text-[10px] text-slate-400">
          <ShieldCheck size={12} className="text-primary" />
          {t("login.authNote")}
        </p>
      </div>
    </div>
  );
}
