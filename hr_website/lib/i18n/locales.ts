import type { Translations } from "@/lib/i18n/translate";
import { en } from "@/lib/i18n/messages/en";
import { vi } from "@/lib/i18n/messages/vi";

/**
 * The languages the app can render, and where the visitor's choice is remembered.
 *
 * Vietnamese is the source language: every message is written there first, and `en` is checked by the
 * compiler against it (`Translations` is `typeof vi`, so a missing English key fails `npx tsc --noEmit`).
 * That is why `DEFAULT_LOCALE` is not merely a fallback — it is what an un-migrated screen still shows.
 */
export const LOCALES = ["vi", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "vi";

/** A cookie, not `localStorage`, because the server renders `<html lang>` from it. */
export const LOCALE_COOKIE = "humora-locale";

/** One year: the choice is a preference, and the login screens set it before a session exists. */
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const LOCALE_LABELS: Record<Locale, string> = {
  vi: "Tiếng Việt",
  en: "English",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** The dictionaries, keyed by locale. */
export const MESSAGES: Record<Locale, Translations> = { vi, en };
