"use client";

import { Loader2, TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

import { useLocale } from "@/components/LocaleProvider";

/**
 * The shell every CRM dialog uses (SCRUM-101/102).
 *
 * It owns the four things a dialog owes a keyboard user — Escape and the backdrop close it, focus moves into
 * the card and returns to whatever opened it, and the page behind cannot scroll — plus the layout rule from
 * `DESIGN.md` §4.4: a bottom-anchored sheet on a phone, a centred card from `sm` up, capped at `85dvh`.
 *
 * The body scrolls and the footer stays visible, which is what makes a long contract form usable on a phone.
 * `wide` is for the forms with two columns (a contract, a customer).
 */
export default function CrmModal({
  title,
  description,
  error,
  busy = false,
  wide = false,
  onClose,
  footer,
  children,
}: {
  title: string;
  description?: string;
  error?: string;
  busy?: boolean;
  wide?: boolean;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useLocale();
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreFocusTo.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cardRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusTo.current?.focus();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label={t("common.close")}
        disabled={busy}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default disabled:cursor-not-allowed"
      />

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-surface shadow-xl outline-none ${
          wide ? "max-w-2xl" : "max-w-lg"
        }`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
          <div className="min-w-0">
            <p id={titleId} className="text-sm font-semibold text-slate-900">
              {title}
            </p>
            {description && (
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t("common.close")}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-surface-muted hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
            >
              <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
          {children}
        </div>

        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200/80 px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

/** The primary button of a dialog footer, with the spinner the screens all use. */
export function CrmSubmit({
  label,
  busy,
  onClick,
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
      {label}
    </button>
  );
}

/** The plain "Huỷ" of a dialog footer. */
export function CrmCancel({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-slate-200 bg-surface px-3.5 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}
