"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  isLocale,
  type Locale,
} from "@/lib/i18n/locales";
import {
  translate,
  type MessageKey,
  type TranslationParams,
} from "@/lib/i18n/translate";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: TranslationParams) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Holds the active language for the whole shell.
 *
 * The server seeds it from the `humora-locale` cookie, so the first paint already carries the right copy
 * and `<html lang>`; this provider owns only *changes* — it writes the cookie, updates `<html lang>` and
 * re-renders the tree. The cookie is deliberately the single source of truth: `localStorage` alone would
 * leave the server render (and therefore the `lang` attribute a screen reader and the browser's own
 * translation prompt read) stuck on the default.
 */
export default function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale?: string;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    isLocale(initialLocale) ? initialLocale : DEFAULT_LOCALE,
  );

  // An external system (the document element), not React state — the shape `ThemeToggle` established.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);

    try {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
    } catch {
      /* Cookie bị chặn: lựa chọn vẫn có hiệu lực cho phiên này. */
    }
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
    }),
    [locale, setLocale],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

/**
 * The active language, a setter and `t()`.
 *
 * Throws outside the provider on purpose: a screen rendering inside the shell always has one, and a
 * silent fallback would hide a component mounted outside it (for example in a new root layout).
 */
export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);

  if (!value) {
    throw new Error(
      "useLocale() must be used inside <LocaleProvider> (see app/layout.tsx).",
    );
  }

  return value;
}
