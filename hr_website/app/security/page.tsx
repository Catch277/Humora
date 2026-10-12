"use client";

import {
  Check,
  Loader2,
  Pencil,
  ScanFace,
  ShieldCheck,
  Smartphone,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useLocale } from "@/components/LocaleProvider";
import type { Passkey } from "@/lib/domain/entities/Passkey";
import { passkeyErrorMessage } from "@/lib/domain/passkeyMessages";
import { getBrowserSupabaseClient } from "@/lib/infrastructure/browserSupabaseClient";
import { formatDate } from "@/lib/i18n/format";
import type { Translate } from "@/lib/i18n/translate";

/** GoTrue's own list shape, where the two optional fields may simply be absent. */
type PasskeyListItem = {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
};

/** Normalised once, so the list renders one shape: GoTrue omits what was never set. */
function toPasskey(item: PasskeyListItem): Passkey {
  return {
    id: item.id,
    friendly_name: item.friendly_name ?? null,
    created_at: item.created_at,
    last_used_at: item.last_used_at ?? null,
  };
}

/**
 * A first guess for the label the operating system picker shows. It only fills the input — the operator
 * can replace it, and GoTrue caps the value at 120 characters.
 *
 * `iPhone` / `iPad` / `Mac` are brand names and stay as they are: the operating system's own picker shows
 * the same strings in either language.
 */
function suggestedDeviceName(t: Translate): string {
  if (typeof navigator === "undefined") {
    return "";
  }

  const agent = navigator.userAgent;

  if (/iPhone/i.test(agent)) return "iPhone";
  if (/iPad/i.test(agent)) return "iPad";
  if (/Android/i.test(agent)) return t("security.device.android");
  if (/Macintosh/i.test(agent)) return "Mac";
  if (/Windows/i.test(agent)) return t("security.device.windows");

  return t("security.device.thisDevice");
}

/** ✓ / ✗ so one screenshot answers what a DevTools console would. */
function mark(value: boolean): string {
  return value ? "✓" : "✗";
}

/** Which action is running, so one button's spinner never impersonates the other two. */
type BusyAction = "REGISTER" | "RENAME" | "DELETE";

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-500/15";

const PRIMARY_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50";

const SECONDARY_BUTTON_CLASS =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-surface px-3 py-1.5 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

const DANGER_BUTTON_CLASS =
  "inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50";

export default function SecurityPage() {
  const { locale, t } = useLocale();
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  /** Whether this browser exposes WebAuthn at all (`false` on plain HTTP, or in an old browser). */
  const [webAuthnAvailable, setWebAuthnAvailable] = useState<boolean | null>(
    null,
  );
  /** Whether it reports a platform authenticator (Touch ID / Windows Hello). Advisory only. */
  const [platformAuthenticator, setPlatformAuthenticator] = useState<
    boolean | null
  >(null);
  /** The one-line "why is it off?" answer; shown only while one of the two banners is up. */
  const [ceremonyDiagnostics, setCeremonyDiagnostics] = useState<string | null>(
    null,
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [friendlyName, setFriendlyName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const loadPasskeys = useCallback(async () => {
    try {
      const { data, error: listError } = await getBrowserSupabaseClient()
        .auth.passkey.list();

      if (listError) {
        setError(passkeyErrorMessage(listError, t));
        setPasskeys([]);
        return;
      }

      setPasskeys((data ?? []).map(toPasskey));
    } catch (listFailure) {
      setError(passkeyErrorMessage(listFailure, t));
      setPasskeys([]);
    }
  }, [t]);

  /**
   * The first load follows the house pattern (`components/Sidebar.tsx`): the state is set from the promise
   * callbacks rather than from the effect body, and an answer that arrives after the screen is gone is
   * dropped. The chain is started from `Promise.resolve()` because the client factory throws when a
   * `NEXT_PUBLIC_*` variable is missing and that failure belongs on the promise path too.
   */
  useEffect(() => {
    let cancelled = false;

    Promise.resolve()
      .then(() => getBrowserSupabaseClient().auth.passkey.list())
      .then(({ data, error: listError }) => {
        if (cancelled) {
          return;
        }

        if (listError) {
          setError(passkeyErrorMessage(listError, t));
          setPasskeys([]);
          return;
        }

        setPasskeys((data ?? []).map(toPasskey));
      })
      .catch((listFailure: unknown) => {
        if (cancelled) {
          return;
        }

        setError(passkeyErrorMessage(listFailure, t));
        setPasskeys([]);
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  /**
   * Two advisory answers, and neither one disables the button — that was the bug this replaced: a machine
   * without Windows Hello (a desktop, an external keyboard or monitor, clamshell, Remote Desktop) answers
   * `false` to `isUserVerifyingPlatformAuthenticatorAvailable()`, yet the same browser can still complete
   * the ceremony with a phone (the QR hand-off) or a security key, so a grey button hid a working path.
   *
   * `PublicKeyCredential` is the only hard stop: WebAuthn is a `[SecureContext]` API, so plain HTTP without
   * a certificate hides it completely. A probe that throws means "cannot be determined" — not "cannot be
   * done" — so it leaves the hint out rather than guessing.
   */
  useEffect(() => {
    let cancelled = false;

    async function detectCeremonySupport() {
      const secureContext = window.isSecureContext;
      const hasApi = typeof window.PublicKeyCredential !== "undefined";

      if (!hasApi) {
        if (!cancelled) {
          setWebAuthnAvailable(false);
          setCeremonyDiagnostics(
            t("security.diagnostic.noWebAuthn", {
              device: suggestedDeviceName(t),
              https: mark(secureContext),
              webAuthn: mark(false),
            }),
          );
        }
        return;
      }

      if (!cancelled) {
        setWebAuthnAvailable(true);
      }

      try {
        const available =
          await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();

        if (!cancelled) {
          setPlatformAuthenticator(available);

          if (!available) {
            setCeremonyDiagnostics(
              t("security.diagnostic.noPlatform", {
                device: suggestedDeviceName(t),
                webAuthn: mark(true),
                faceId: mark(false),
              }),
            );
          }
        }
      } catch {
        // Left unknown on purpose: the ceremony itself is the authority.
      }
    }

    void detectCeremonySupport();

    return () => {
      cancelled = true;
    };
  }, [t]);

  // The box starts empty on purpose: a name typed here is the label the credential gets, and a blank one
  // falls back to `suggestedDeviceName()` inside `handleRegister` — the device name only has to be right
  // once the credential exists, which avoids an effect that would fill state after mount.

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy !== null) {
      return;
    }

    setError("");
    setNotice("");
    setBusy("REGISTER");

    try {
      const supabase = getBrowserSupabaseClient();
      // The ceremony: the operating system asks for Face ID / Windows Hello, and the private key it
      // creates never leaves the device — only the public half reaches Supabase Auth.
      const { data, error: registerError } =
        await supabase.auth.registerPasskey();

      if (registerError || !data) {
        setError(passkeyErrorMessage(registerError, t));
        return;
      }

      // A blank box still gets a sensible label: the operating system picker shows the device the passkey
      // was created on.
      const name = friendlyName.trim() || suggestedDeviceName(t);

      if (name) {
        // Registration takes no name, so the label is a second, ordinary call — and a failure here is
        // not a failed registration: the credential is already usable.
        const { error: renameError } = await supabase.auth.passkey.update({
          passkeyId: data.id,
          friendlyName: name,
        });

        if (renameError) {
          setError(passkeyErrorMessage(renameError, t));
        }
      }

      setFriendlyName("");
      setNotice(t("security.notice.registered"));
      await loadPasskeys();
    } catch (registerFailure) {
      setError(passkeyErrorMessage(registerFailure, t));
    } finally {
      setBusy(null);
    }
  }

  async function handleRename(passkey: Passkey) {
    const name = editingName.trim();

    if (busy !== null || !name) {
      return;
    }

    setError("");
    setNotice("");
    setBusy("RENAME");

    try {
      const { error: renameError } =
        await getBrowserSupabaseClient().auth.passkey.update({
          passkeyId: passkey.id,
          friendlyName: name,
        });

      if (renameError) {
        setError(passkeyErrorMessage(renameError, t));
        return;
      }

      setEditingId(null);
      setNotice(t("security.notice.renamed"));
      await loadPasskeys();
    } catch (renameFailure) {
      setError(passkeyErrorMessage(renameFailure, t));
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(passkey: Passkey) {
    if (busy !== null) {
      return;
    }

    setError("");
    setNotice("");
    setBusy("DELETE");

    try {
      const { error: deleteError } =
        await getBrowserSupabaseClient().auth.passkey.delete({
          passkeyId: passkey.id,
        });

      if (deleteError) {
        setError(passkeyErrorMessage(deleteError, t));
        return;
      }

      setConfirmingId(null);
      setNotice(t("security.notice.deleted"));
      await loadPasskeys();
    } catch (deleteFailure) {
      setError(passkeyErrorMessage(deleteFailure, t));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 py-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {t("security.eyebrow")}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          {t("security.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("security.subtitle")}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <Check size={16} className="mt-0.5 shrink-0" />
          {notice}
        </div>
      )}

      {webAuthnAvailable === false && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <div>
            <p>
              {t("security.banner.noWebAuthn")}
            </p>
            {ceremonyDiagnostics && (
              <p className="mt-2 font-semibold">{ceremonyDiagnostics}</p>
            )}
          </div>
        </div>
      )}

      {webAuthnAvailable === true && platformAuthenticator === false && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-800">
          <ScanFace size={16} className="mt-0.5 shrink-0" />
          <div>
            <p>
              {t("security.banner.noPlatformBefore")}
              <span className="font-semibold">{t("security.enable")}</span>
              {t("security.banner.noPlatformAfter")}
            </p>
            {ceremonyDiagnostics && (
              <p className="mt-2 font-semibold">{ceremonyDiagnostics}</p>
            )}
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-surface shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
              <ScanFace size={17} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {t("security.listTitle")}
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {t("security.listHint")}
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-primary">
            {passkeys === null
              ? "…"
              : t("security.deviceCount", { count: passkeys.length })}
          </span>
        </div>

        {passkeys === null ? (
          <p className="flex items-center gap-2 p-5 text-xs text-slate-500">
            <Loader2 size={14} className="animate-spin" />
            {t("security.loading")}
          </p>
        ) : passkeys.length === 0 ? (
          <p className="p-5 text-xs text-slate-500">
            {t("security.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {passkeys.map((passkey) => (
              <li
                key={passkey.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
                    <Smartphone size={16} />
                  </div>
                  <div className="min-w-0">
                    {editingId === passkey.id ? (
                      <input
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        maxLength={120}
                        autoFocus
                        className={`${INPUT_CLASS} max-w-xs`}
                      />
                    ) : (
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {passkey.friendly_name ?? t("security.unnamed")}
                      </p>
                    )}
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {t("security.meta", {
                        created: formatDate(passkey.created_at, locale),
                        used: formatDate(passkey.last_used_at, locale),
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {editingId === passkey.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleRename(passkey)}
                        disabled={busy !== null || !editingName.trim()}
                        className={PRIMARY_BUTTON_CLASS}
                      >
                        {busy === "RENAME" ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Check size={13} />
                        )}
                        {t("common.save")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className={SECONDARY_BUTTON_CLASS}
                      >
                        {t("common.cancel")}
                      </button>
                    </>
                  ) : confirmingId === passkey.id ? (
                    <>
                      <span className="text-[11px] font-semibold text-rose-600">
                        {t("security.confirmDelete")}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleDelete(passkey)}
                        disabled={busy !== null}
                        className={DANGER_BUTTON_CLASS}
                      >
                        {busy === "DELETE" ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Trash2 size={13} />
                        )}
                        {t("common.delete")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        className={SECONDARY_BUTTON_CLASS}
                      >
                        {t("common.cancel")}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(passkey.id);
                          setEditingName(passkey.friendly_name ?? "");
                          setConfirmingId(null);
                        }}
                        className={SECONDARY_BUTTON_CLASS}
                      >
                        <Pencil size={13} />
                        {t("security.rename")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmingId(passkey.id);
                          setEditingId(null);
                        }}
                        className={SECONDARY_BUTTON_CLASS}
                      >
                        <Trash2 size={13} />
                        {t("common.delete")}
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={handleRegister}
          className="flex flex-col gap-3 border-t border-slate-100 p-5 sm:flex-row sm:items-end"
        >
          <label className="flex-1 text-xs font-semibold text-slate-600">
            {t("security.deviceNameLabel")}
            <input
              value={friendlyName}
              onChange={(event) => setFriendlyName(event.target.value)}
              maxLength={120}
              placeholder={t("security.deviceNamePlaceholder")}
              disabled={busy !== null}
              className={`mt-1 ${INPUT_CLASS}`}
            />
          </label>
          <button
            type="submit"
            disabled={busy !== null}
            className={PRIMARY_BUTTON_CLASS}
          >
            {busy === "REGISTER" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ScanFace size={14} />
            )}
            {busy === "REGISTER" ? t("security.waiting") : t("security.enable")}
          </button>
        </form>
        <p className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500">
          {t("security.privacyNote")}
        </p>
      </section>

      <section className="flex items-start gap-3 rounded-xl border border-blue-100 bg-surface-accent p-5">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
        <div className="space-y-2 text-xs text-slate-600">
          <p className="font-semibold text-slate-700">{t("security.knowTitle")}</p>
          <p>{t("security.fact1")}</p>
          <p>{t("security.fact2")}</p>
          <p>{t("security.fact3")}</p>
          <p>
            {t("security.fact4Before")}
            <Link
              href="/change-password"
              className="font-semibold text-primary hover:underline"
            >
              {t("changePassword.title")}
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
