import type { vi } from "@/lib/i18n/messages/vi";
import { DEFAULT_LOCALE, MESSAGES, type Locale } from "@/lib/i18n/locales";

/**
 * Every message key the app knows. Vietnamese is the source of truth, so the key union *is* the set of
 * keys in `messages/vi.ts`; `messages/en.ts` is typed as `Translations` (a `Record` over that union) and a
 * missing English key therefore fails `npx tsc --noEmit` instead of rendering a Vietnamese sentence
 * inside an English screen.
 *
 * Dot-separated keys (`header.signOut`) keep the file flat and greppable — `t("header.signOut")` is one
 * search away from the copy it renders, which matters far more here than nesting.
 */
export type MessageKey = keyof typeof vi;

export type Translations = Record<MessageKey, string>;

/** Values may be interpolated as `{name}`. */
export type TranslationParams = Record<string, string | number>;

/**
 * What `useLocale().t` is, and what every helper that renders copy takes as its **last** argument.
 *
 * A module-level helper (a `statusLabel`, an `accountErrorMessage`) has no hook and therefore no
 * context: the component passes `t` down to it. Typing the parameter with this alias keeps those
 * helpers testable and independent of React.
 */
export type Translate = (key: MessageKey, params?: TranslationParams) => string;

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Look a key up in the active locale, falling back to Vietnamese (the source language) and finally to
 * the key itself — a screen must never go blank because a translator has not reached it yet.
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  params?: TranslationParams,
): string {
  const message = MESSAGES[locale]?.[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? String(key);

  if (!params) {
    return message;
  }

  return message.replace(PLACEHOLDER, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * The Vietnamese translator, for a module-level helper a component did not hand a `t` to.
 *
 * `DEFAULT_LOCALE` is the source language, so this is the wording a screen has always shown — the
 * shared label helpers (`roleLabel`, `attendanceStatusLabel`, …) take it as their default and keep
 * rendering Vietnamese until the screen that calls them is migrated and passes `useLocale().t`.
 */
export const translateVi: Translate = (key, params) =>
  translate(DEFAULT_LOCALE, key, params);
