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

import type { Passkey } from "@/lib/domain/entities/Passkey";
import { passkeyErrorMessage } from "@/lib/domain/passkeyMessages";
import { getBrowserSupabaseClient } from "@/lib/infrastructure/browserSupabaseClient";

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

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" });

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? "—" : dateFormatter.format(parsed);
}

/**
 * A first guess for the label the operating system picker shows. It only fills the input — the operator
 * can replace it, and GoTrue caps the value at 120 characters.
 */
function suggestedDeviceName(): string {
  if (typeof navigator === "undefined") {
    return "";
  }

  const agent = navigator.userAgent;

  if (/iPhone/i.test(agent)) return "iPhone";
  if (/iPad/i.test(agent)) return "iPad";
  if (/Android/i.test(agent)) return "Điện thoại Android";
  if (/Macintosh/i.test(agent)) return "Mac";
  if (/Windows/i.test(agent)) return "Máy tính Windows";

  return "Thiết bị này";
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
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [platformAuthenticator, setPlatformAuthenticator] = useState<
    boolean | null
  >(null);
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
        setError(passkeyErrorMessage(listError));
        setPasskeys([]);
        return;
      }

      setPasskeys((data ?? []).map(toPasskey));
    } catch (listFailure) {
      setError(passkeyErrorMessage(listFailure));
      setPasskeys([]);
    }
  }, []);

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
          setError(passkeyErrorMessage(listError));
          setPasskeys([]);
          return;
        }

        setPasskeys((data ?? []).map(toPasskey));
      })
      .catch((listFailure: unknown) => {
        if (cancelled) {
          return;
        }

        setError(passkeyErrorMessage(listFailure));
        setPasskeys([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Whether this device can run the ceremony at all. Without a platform authenticator there is no Face
   * ID / Windows Hello to unlock, so the button would only ever fail — better to say so.
   */
  useEffect(() => {
    let cancelled = false;

    async function detectPlatformAuthenticator() {
      if (typeof window.PublicKeyCredential === "undefined") {
        if (!cancelled) {
          setPlatformAuthenticator(false);
        }
        return;
      }

      try {
        const available =
          await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();

        if (!cancelled) {
          setPlatformAuthenticator(available);
        }
      } catch {
        if (!cancelled) {
          setPlatformAuthenticator(false);
        }
      }
    }

    void detectPlatformAuthenticator();

    return () => {
      cancelled = true;
    };
  }, []);

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
        setError(passkeyErrorMessage(registerError));
        return;
      }

      // A blank box still gets a sensible label: the operating system picker shows the device the passkey
      // was created on.
      const name = friendlyName.trim() || suggestedDeviceName();

      if (name) {
        // Registration takes no name, so the label is a second, ordinary call — and a failure here is
        // not a failed registration: the credential is already usable.
        const { error: renameError } = await supabase.auth.passkey.update({
          passkeyId: data.id,
          friendlyName: name,
        });

        if (renameError) {
          setError(passkeyErrorMessage(renameError));
        }
      }

      setFriendlyName("");
      setNotice("Đã bật đăng nhập nhanh trên thiết bị này.");
      await loadPasskeys();
    } catch (registerFailure) {
      setError(passkeyErrorMessage(registerFailure));
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
        setError(passkeyErrorMessage(renameError));
        return;
      }

      setEditingId(null);
      setNotice("Đã đổi tên thiết bị.");
      await loadPasskeys();
    } catch (renameFailure) {
      setError(passkeyErrorMessage(renameFailure));
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
        setError(passkeyErrorMessage(deleteError));
        return;
      }

      setConfirmingId(null);
      setNotice("Đã xoá thiết bị. Mật khẩu của bạn vẫn dùng được như trước.");
      await loadPasskeys();
    } catch (deleteFailure) {
      setError(passkeyErrorMessage(deleteFailure));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 py-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Bảo mật / SCRUM-79
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          Bảo mật đăng nhập
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Bật Face ID / vân tay trên thiết bị này để mở phiên làm việc mà không
          cần gõ mật khẩu.
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

      {platformAuthenticator === false && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <p>
            Thiết bị hoặc trình duyệt này không có Face ID / Windows Hello cho
            WebAuthn, nên chưa bật đăng nhập nhanh được. Hãy mở trang này trên
            điện thoại hoặc máy tính có cảm biến, qua HTTPS (localhost cũng
            được). Đăng nhập bằng mật khẩu vẫn hoạt động bình thường.
          </p>
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
                Thiết bị đã bật đăng nhập nhanh
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Mỗi thiết bị được bật riêng: bật trên điện thoại thì máy tính
                vẫn cần mật khẩu.
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-primary">
            {passkeys === null ? "…" : `${passkeys.length} thiết bị`}
          </span>
        </div>

        {passkeys === null ? (
          <p className="flex items-center gap-2 p-5 text-xs text-slate-500">
            <Loader2 size={14} className="animate-spin" /> Đang tải danh sách
            thiết bị...
          </p>
        ) : passkeys.length === 0 ? (
          <p className="p-5 text-xs text-slate-500">
            Chưa có thiết bị nào. Bật ở dưới để lần sau chỉ cần Face ID / vân
            tay.
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
                        {passkey.friendly_name ?? "Chưa đặt tên"}
                      </p>
                    )}
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Đã bật {formatDate(passkey.created_at)} · Dùng gần nhất{" "}
                      {formatDate(passkey.last_used_at)}
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
                        Lưu
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className={SECONDARY_BUTTON_CLASS}
                      >
                        Huỷ
                      </button>
                    </>
                  ) : confirmingId === passkey.id ? (
                    <>
                      <span className="text-[11px] font-semibold text-rose-600">
                        Xoá thiết bị này?
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
                        Xoá
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        className={SECONDARY_BUTTON_CLASS}
                      >
                        Huỷ
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
                        Đổi tên
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
                        Xoá
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
            Tên thiết bị
            <input
              value={friendlyName}
              onChange={(event) => setFriendlyName(event.target.value)}
              maxLength={120}
              placeholder="Ví dụ: iPhone của An"
              disabled={busy !== null}
              className={`mt-1 ${INPUT_CLASS}`}
            />
          </label>
          <button
            type="submit"
            disabled={busy !== null || platformAuthenticator === false}
            className={PRIMARY_BUTTON_CLASS}
          >
            {busy === "REGISTER" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ScanFace size={14} />
            )}
            {busy === "REGISTER" ? "Đang chờ thiết bị..." : "Bật Face ID"}
          </button>
        </form>
        <p className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500">
          Thiết bị sẽ hỏi Face ID / Windows Hello. Hệ thống không lưu ảnh khuôn
          mặt hay mẫu vân tay: khoá riêng tư nằm trong thiết bị, Supabase Auth
          chỉ giữ khoá công khai.
        </p>
      </section>

      <section className="flex items-start gap-3 rounded-xl border border-blue-100 bg-surface-accent p-5">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
        <div className="space-y-2 text-xs text-slate-600">
          <p className="font-semibold text-slate-700">Cần biết</p>
          <p>
            · Lần sau, ở trang đăng nhập, bấm “Đăng nhập bằng Face ID” rồi xác
            thực trên thiết bị — không cần email hay mật khẩu.
          </p>
          <p>
            · Mất thiết bị thì xoá nó ở đây; mật khẩu vẫn dùng được nên tài
            khoản không bị khoá.
          </p>
          <p>
            · WebAuthn chỉ chạy trên HTTPS hoặc localhost, và tên miền phải khớp
            Relying Party ID trong Supabase Dashboard (Authentication →
            Passkeys).
          </p>
          <p>
            · Đổi mật khẩu vẫn ở{" "}
            <Link
              href="/change-password"
              className="font-semibold text-primary hover:underline"
            >
              Đổi mật khẩu
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
