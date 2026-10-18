"use client";

import { Languages } from "lucide-react";

import { useLocale } from "@/components/LocaleProvider";
import { DEFAULT_LOCALE, LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/locales";

/** The cycle the phone button walks through, so one tap is always enough on a narrow header. */
function nextLocale(current: Locale): Locale {
  const index = LOCALES.indexOf(current);

  return LOCALES[(index + 1) % LOCALES.length] ?? DEFAULT_LOCALE;
}

/**
 * Tiếng Việt / English.
 *
 * Two shapes, like `ThemeToggle`: both buttons on a wide screen, one cycling button below `md` where the
 * header has no room. The labels come from the dictionary, so the switch itself is translated too.
 */
export default function LanguageToggle() {
  const { locale, setLocale, t } = useLocale();

  return (
    <>
      <button
        type="button"
        onClick={() => setLocale(nextLocale(locale))}
        aria-label={t("language.change", { current: LOCALE_LABELS[locale] })}
        title={LOCALE_LABELS[locale]}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-surface text-slate-600 transition-colors hover:bg-slate-50 md:hidden"
      >
        <Languages size={16} />
      </button>

      <div
        role="group"
        aria-label={t("language.group")}
        className="hidden items-center gap-0.5 rounded-lg border border-slate-200 bg-surface-muted p-0.5 md:flex"
      >
        {LOCALES.map((option) => {
          const isActive = option === locale;

          return (
            <button
              key={option}
              type="button"
              onClick={() => setLocale(option)}
              aria-pressed={isActive}
              title={LOCALE_LABELS[option]}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                isActive
                  ? "bg-surface text-primary shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {option.toUpperCase()}
            </button>
          );
        })}
      </div>
    </>
  );
}
