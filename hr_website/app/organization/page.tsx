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

import { useLocale } from "@/components/LocaleProvider";
import { roleLabel } from "@/lib/accessPolicy";
import { INVITE_ROLES } from "@/lib/domain/entities/OrganizationInvite";
import { isMemberConflictMessage } from "@/lib/domain/errors/StaffAccountEmailTakenError";
import type { Locale } from "@/lib/i18n/locales";
import type { Translate } from "@/lib/i18n/translate";

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
 * The provisioning form's own copy. `409` covers two different conflicts and the fix differs, so the API
 * forwards the Edge Function's own sentence and `StaffAccountEmailTakenError` owns the test that tells them
 * apart. A member conflict has nothing left to create; the other case is an address that merely has its own
 * Supabase Auth login, which is *not* necessarily visible in `public.users` (a `createUser` that ran while
 * the SCRUM-50 trigger was missing leaves an auth account with no profile row), hence the copy names where
 * to look.
 */
/**
 * The signature of an **older deployment** of the `staff-account` Edge Function: the revision that predates
 * SCRUM-59 only knows the role spelling `CHU`, so it rejects the `MANAGER` this app sends with
 * `role must be EMPLOYEE or CHU.` — and no form value can satisfy it.
 *
 * It gets its own sentence because the caller's next step is an *operator* task (paste the current
 * `supabase/functions/staff-account/index.ts` into Dashboard → Edge Functions → staff-account → Deploy), not
 * a correction to the form. Telling them "the data is invalid" would send them round the same loop again.
 */
const STALE_ROLE_REJECTION = /role must be .*chu/i;

function accountErrorMessage(
  status: number,
  serverMessage: string | undefined,
  t: Translate,
): string {
  if (status === 409) {
    if (isMemberConflictMessage(serverMessage)) {
      return t("organization.error.memberConflict");
    }

    return t("organization.error.emailTaken");
  }

  if (STALE_ROLE_REJECTION.test(serverMessage ?? "")) {
    return t("organization.error.staleFunction");
  }

  if (status === 400 || status === 422) {
    return t("organization.error.invalid");
  }

  if (status === 429) {
    return t("organization.error.tooMany");
  }

  if (status === 503) {
    return t("organization.error.notDeployed");
  }

  return actionErrorMessage(status, serverMessage, t);
}

function formatDateTime(value: string | null, locale: Locale): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  // The date *style* follows the reader's language; the time zone does not — a business day stays
  // Asia/Bangkok whatever the locale is.
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(parsed);
}

function actionErrorMessage(
  status: number,
  serverMessage: string | undefined,
  t: Translate,
): string {
  if (status === 401) {
    return t("organization.error.sessionExpired");
  }

  if (status === 403) {
    return t("organization.error.ownerOnly");
  }

  if (status === 404) {
    return t("organization.error.notFound");
  }

  if (status === 409) {
    return t("organization.error.alreadyListed");
  }

  if (status === 400) {
    return serverMessage ?? t("organization.error.invalidShort");
  }

  return serverMessage ?? t("organization.error.generic");
}

type StaffProvisioningAvailability = {
  available: boolean;
  reason: string;
  detail: string | null;
};

/**
 * Copy for the reason the probe reported (SCRUM-52). "Not deployed" is something the operator fixes,
 * "not allowed" is a role problem and "misconfigured" means the function is there but failing — three
 * different actions, so they must not share one sentence.
 */
function provisioningNote(
  availability: StaffProvisioningAvailability | null,
  t: Translate,
): string {
  switch (availability?.reason) {
    case "not_allowed":
      return t("organization.ownerRequired");
    case "unauthenticated":
      return t("organization.provision.sessionRejected");
    case "misconfigured":
      return availability.detail
        ? t("organization.provision.misconfiguredDetail", {
            detail: availability.detail,
          })
        : t("organization.provision.misconfigured");
    case "ready":
      return "";
    default:
      return t("organization.functionMissing");
  }
}

const inputClassName =
  "w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-500/15";

export default function OrganizationPage() {
  const { locale, t } = useLocale();
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
          error: actionErrorMessage(summaryResponse.status, data?.error, t),
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

      // SCRUM-52: the account-provisioning form is only offered when the Edge Function can actually be
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
          error: actionErrorMessage(invitesResponse.status, data?.error, t),
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
        setPageError(t("organization.networkError"));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `t` is in the deps on purpose: it is stable per locale, and a language switch has to re-run this load
    // so an error banner that was already stored in state is re-rendered in the new language.
  }, [reloadToken, t]);

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
      setNote(t("organization.copyCodeDone"));
    } catch {
      setNote(t("organization.copyFailed"));
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
        setPageError(actionErrorMessage(response.status, data?.error, t));
        return;
      }

      setNote(t("organization.saveNameDone"));
      refresh();
    } catch {
      setPageError(t("organization.networkError"));
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
        setPageError(actionErrorMessage(response.status, data?.error, t));
        return;
      }

      setNote(t("organization.rotateCodeDone"));
      refresh();
    } catch {
      setPageError(t("organization.networkError"));
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
        setPageError(actionErrorMessage(response.status, data?.error, t));
        return;
      }

      setInviteEmail("");
      setInviteFullName("");
      setInviteRole("EMPLOYEE");
      setNote(t("organization.inviteAdded"));
      refresh();
    } catch {
      setPageError(t("organization.networkError"));
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
        setPageError(actionErrorMessage(response.status, data?.error, t));
        return;
      }

      setNote(t("organization.inviteRevoked"));
      refresh();
    } catch {
      setPageError(t("organization.networkError"));
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
        setAccountError(accountErrorMessage(response.status, data?.error, t));
        return;
      }

      setAccountNote(
        t("organization.accountCreated", { email: accountEmail.trim() }),
      );
      setAccountEmail("");
      setAccountFullName("");
      setAccountRole("EMPLOYEE");
      setAccountPassword("");
      setAccountPasswordVisible(false);
      refresh();
    } catch {
      setAccountError(t("organization.networkError"));
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" />
        {t("organization.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {t("organization.eyebrow")}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          {organizationName || t("organization.heading")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("organization.subtitle")}
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
          <p className="font-semibold text-slate-800">{t("organization.noOrganization")}</p>
          <p className="mt-1">
            {t("organization.emptyHint")}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {t("organization.membersCard")}
                </p>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-primary">
                  <Users size={16} />
                </span>
              </div>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {summary.member_count}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                {t("organization.membersHint")}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {t("organization.pendingInvites")}
                </p>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <Mail size={16} />
                </span>
              </div>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {summary.pending_invite_count}
              </p>
              <p className="mt-1 text-[10px] text-amber-600">
                {t("organization.pendingHint")}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {t("organization.yourRole")}
                </p>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <ShieldCheck size={16} />
                </span>
              </div>
              <p className="mt-2 text-lg font-bold text-slate-900">
                {canManage ? t("organization.manageHeading") : t("organization.membersTab")}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                {canManage
                  ? t("organization.ownerOnlyTab")
                  : t("organization.memberOnlyTab")}
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
                  <h2 className="font-bold text-slate-900">{t("organization.nameLabel")}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {t("organization.nameHint")}
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
                  aria-label={t("organization.nameLabel")}
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
                  {t("organization.saveName")}
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
                    <h2 className="font-bold text-slate-900">{t("organization.joinCodeLabel")}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {t("organization.codeHint")}
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
                  {copied ? t("organization.copied") : t("organization.copy")}
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
                  {t("organization.rotateCode")}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {t("organization.rotateHint")}
              </p>
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-surface p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
                  <KeyRound size={18} />
                </span>
                <div>
                  <h2 className="font-bold text-slate-900">
                    {t("organization.provisionTitle")}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {t("organization.provisionHint")}
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
                      {t("organization.fullNameLabel")}
                      <input
                        value={accountFullName}
                        onChange={(event) => setAccountFullName(event.target.value)}
                        placeholder={t("organization.fullNamePlaceholder")}
                        className={`mt-1 ${inputClassName}`}
                      />
                    </label>
                    <label className="block text-xs font-semibold text-slate-600">
                      {t("organization.inviteRoleLabel")}
                      <select
                        value={accountRole}
                        onChange={(event) => setAccountRole(event.target.value)}
                        className={`mt-1 ${inputClassName}`}
                      >
                        {INVITE_ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {roleLabel(role, t)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-semibold text-slate-600">
                      {t("organization.passwordLabel", { count: MIN_PASSWORD_LENGTH })}
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
                          {accountPasswordVisible ? t("organization.hidePassword") : t("organization.showPassword")}
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
                    {t("organization.createAccountButton")}
                  </button>

                  <p className="mt-2 text-[11px] text-slate-500">
                    {t("organization.passwordHint")}
                  </p>
                </>
              ) : (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{provisioningNote(provisioning, t)}</span>
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
                      {t("organization.inviteTitle")}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {t("organization.inviteHint")}
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
                    {t("organization.fullNameOptional")}
                    <input
                      value={inviteFullName}
                      onChange={(event) => setInviteFullName(event.target.value)}
                      placeholder={t("organization.fullNamePlaceholder")}
                      className={`mt-1 ${inputClassName}`}
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-600">
                    {t("organization.inviteRoleLabel")}
                    <select
                      value={inviteRole}
                      onChange={(event) => setInviteRole(event.target.value)}
                      className={`mt-1 ${inputClassName}`}
                    >
                      {INVITE_ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {roleLabel(role, t)}
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
                  {t("organization.inviteSubmit")}
                </button>
              </div>

              {invites.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">
                  {t("organization.invitesEmpty")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">{t("organization.columnEmail")}</th>
                        <th className="px-4 py-3 font-semibold">{t("organization.columnFullName")}</th>
                        <th className="px-4 py-3 font-semibold">{t("organization.columnRole")}</th>
                        <th className="px-4 py-3 font-semibold">{t("organization.columnStatus")}</th>
                        <th className="px-4 py-3 font-semibold">{t("organization.columnAddedAt")}</th>
                        <th className="px-4 py-3 font-semibold">{t("organization.columnActions")}</th>
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
                            {roleLabel(invite.role, t)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                                invite.claimed_by
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {invite.claimed_by ? t("organization.statusJoined") : t("organization.statusPending")}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {formatDateTime(invite.created_at, locale)}
                          </td>
                          <td className="px-4 py-3">
                            {invite.claimed_by ? (
                              <span className="text-[11px] text-slate-400">{t("organization.used")}</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void revokeInvite(invite.id)}
                                disabled={busy !== ""}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-[11px] font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
                              >
                                <Trash2 size={13} />
                                {t("organization.revoke")}
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
                  {t("organization.ownerOnlyNotice")}
                </p>
                <p className="mt-1">
                  {t("organization.memberNotice")}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}