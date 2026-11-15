"use client";

import { Loader2, TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

import { useLocale } from "@/components/LocaleProvider";

/**
 * The shell's confirmation dialog.
 *
 * It exists so an irreversible or session-ending click asks first without leaving the screen: the
 * screens that still use `window.confirm()` (branches, facilities, schedules) print Vietnamese text in a
 * browser frame that cannot be themed, styled or translated — this one reads its labels from the caller
 * and follows the app's own design tokens.
 *
 * The four things a dialog owes a keyboard user are here: Escape and the backdrop close it, focus moves
 * onto the safe (cancel) button, focus returns to whatever opened it, and the page behind cannot scroll.
 * The layout follows `DESIGN.md` §4.4 — bottom-anchored sheet on a phone, centred card from `sm` up,
 * capped at `85dvh`.
 */
export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  error,
  busy = false,
  tone = "primary",
  onConfirm,
  onCancel,
}: {
  title: string;
  /** The consequence of confirming, in one or two sentences. */
  description?: string;
  confirmLabel: string;
  /** A failure the caller wants to report without closing the dialog. */
  error?: string;
  /** Disables both buttons and the dismiss gestures while the action is in flight. */
  busy?: boolean;
  /** `danger` paints the confirm button red and puts a warning icon beside the title. */
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useLocale();
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  /** Whatever had focus before the dialog opened, so closing it does not drop the keyboard user at the top. */
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  // Focus and the scroll lock belong to "the dialog is mounted", not to any prop: re-running this
  // effect on `busy` would yank focus back to Cancel every time the action starts.
  useEffect(() => {
    restoreFocusTo.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusTo.current?.focus();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label={t("common.close")}
        disabled={busy}
        onClick={onCancel}
        className="absolute inset-0 h-full w-full cursor-default disabled:cursor-not-allowed"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="relative flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-surface shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
          <div className="flex items-start gap-2">
            {tone === "danger" && (
              <TriangleAlert
                size={16}
                className="mt-0.5 shrink-0 text-rose-600"
                aria-hidden="true"
              />
            )}
            <p id={titleId} className="text-sm font-semibold text-slate-900">
              {title}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label={t("common.close")}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-surface-muted hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex flex-col gap-3 overflow-y-auto px-4 py-4">
          {description && (
            <p id={descriptionId} className="text-xs leading-relaxed text-slate-600">
              {description}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
            >
              <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200/80 px-4 py-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-slate-200 bg-surface px-3.5 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              tone === "danger"
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-primary hover:bg-primary-strong"
            }`}
          >
            {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
