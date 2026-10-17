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

import { useLocale } from "@/components/LocaleProvider";
import type { Translate } from "@/lib/i18n/translate";

type OrganizationSummary = {
  organization: { id: string; name: string } | null;
  member_count: number;
  pending_invite_count: number;
};

const MIN_NAME_LENGTH = 2;

/**
 * Copy for the create failures. `t` is last, like every module-level helper on a migrated screen: a
 * function outside the component has no hook, so the component hands it the translator.
 */
function createErrorMessage(
  status: number,
  serverMessage: string | undefined,
  t: Translate,
): string {
  if (status === 401) {
    return t("error.sessionExpired");
  }

  if (status === 409) {
    return t("onboarding.error.alreadyMember");
  }

  if (status === 429) {
    return t("onboarding.error.tooMany");
  }

  if (status === 400) {
    return t("onboarding.error.nameTooShort", { min: MIN_NAME_LENGTH });
  }

  return serverMessage ?? t("onboarding.error.createFailed");
}

/**
 * Copy for the join failures. `403` covers two very different cases, and the difference matters to the
 * person typing the code, so it is read from the message the API documents
 * (`organizationErrorResponse` maps both to 403, the wording comes from the domain errors). The token
 * it matches — the English word `code` in the server's sentence — is unchanged; only the answer is
 * translated.
 */
function joinErrorMessage(
  status: number,
  serverMessage: string | undefined,
  t: Translate,
): string {
  if (status === 401) {
    return t("error.sessionExpired");
  }

  if (status === 409) {
    return t("onboarding.error.alreadyMember");
  }

  if (status === 429) {
    return t("onboarding.error.tooMany");
  }

  if (status === 403) {
    return serverMessage && serverMessage.toLowerCase().includes("code")
      ? t("onboarding.error.codeUnknown")
      : t("onboarding.error.notRegistered");
  }

  if (status === 400) {
    return t("onboarding.error.codeInvalid");
  }

  return serverMessage ?? t("onboarding.error.joinFailed");
}

const inputClassName =
  "w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-500/15";

export default function OnboardingPage() {
  const { t } = useLocale();
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
        setError(createErrorMessage(response.status, data?.error, t));
        return;
      }

      router.replace("/organization");
      router.refresh();
    } catch {
      setError(t("error.network"));
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
        setError(joinErrorMessage(response.status, data?.error, t));
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError(t("error.network"));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {t("onboarding.eyebrow")}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          {t("onboarding.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("onboarding.subtitle")}
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
          <h2 className="mt-4 font-bold text-slate-900">
            {t("onboarding.createTitle")}
          </h2>
          <p className="mt-1 flex-1 text-xs text-slate-500">
            {t("onboarding.createHint")}
          </p>
          <label className="mt-4 block text-xs font-semibold text-slate-600">
            {t("organization.nameLabel")}
            <input
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              placeholder={t("onboarding.namePlaceholder")}
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
            {t("onboarding.createButton")}
          </button>
        </section>

        <section className="flex flex-col rounded-2xl border border-slate-200/80 bg-surface p-5 shadow-sm">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <KeyRound size={20} />
          </span>
          <h2 className="mt-4 font-bold text-slate-900">
            {t("onboarding.joinTitle")}
          </h2>
          <p className="mt-1 flex-1 text-xs text-slate-500">
            {t("onboarding.joinHint")}
          </p>
          <label className="mt-4 block text-xs font-semibold text-slate-600">
            {t("organization.joinCodeLabel")}
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder={t("onboarding.codePlaceholder")}
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
            {t("onboarding.joinButton")}
          </button>
        </section>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-surface-accent p-4">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
        <div className="text-xs text-slate-600">
          <p className="font-semibold text-slate-800">
            {t("onboarding.whyTitle")}
          </p>
          <p className="mt-1">
            {t("onboarding.whyBefore")}
            <span className="font-medium">{t("organization.heading")}</span>.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Users size={14} />
        {t("onboarding.registerHint")}
      </div>
    </div>
  );
}
