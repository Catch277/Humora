"use client";

import { Check, ChevronDown, Globe } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { useLocale } from "@/components/LocaleProvider";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/locales";

/** The two-letter code in the closed box, so the active language is readable without opening it. */
const SHORT_CODES: Record<Locale, string> = { vi: "VI", en: "EN" };

/**
 * The flag that belongs to a language.
 *
 * Drawn inline rather than written as an emoji (`🇻🇳`, `🇬🇧`): Windows ships no flag glyphs, so those
 * two code points render as the bare letters "VN"/"GB" there. The fills are the one place a component
 * must carry literal colours — a national flag has no theme token and must not change between light
 * and dark, which is exactly what the token rule in `app/globals.css` protects.
 */
function LocaleFlag({ locale }: { locale: Locale }) {
  if (locale === "vi") {
    return (
      <svg
        viewBox="0 0 24 16"
        aria-hidden="true"
        focusable="false"
        className="h-3.5 w-5 shrink-0 rounded-[2px] ring-1 ring-black/10"
      >
        <rect width="24" height="16" fill="#DA251D" />
        <path
          d="M12 3.6 13.03 6.58 16.18 6.64 13.67 8.54 14.59 11.56 12 9.76 9.41 11.56 10.33 8.54 7.82 6.64 10.97 6.58Z"
          fill="#FFFF00"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 60 30"
      aria-hidden="true"
      focusable="false"
      className="h-3.5 w-5 shrink-0 rounded-[2px] ring-1 ring-black/10"
    >
      <rect width="60" height="30" fill="#012169" />
      <path d="M0 0 60 30M60 0 0 30" stroke="#FFFFFF" strokeWidth="6" />
      <path d="M0 0 60 30M60 0 0 30" stroke="#C8102E" strokeWidth="3" />
      <path d="M30 0v30M0 15h60" stroke="#FFFFFF" strokeWidth="10" />
      <path d="M30 0v30M0 15h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

/**
 * The focusable options of the open menu.
 *
 * A module-level helper rather than a closure: the effect below and the key handlers both need it, and
 * a function defined inside the component would have to be listed as a dependency of that effect.
 */
function menuItemsWithin(container: HTMLElement | null): HTMLButtonElement[] {
  return container
    ? Array.from(
        container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
      )
    : [];
}

/**
 * Tiếng Việt / English.
 *
 * One box on every width: a globe, the active code and a caret, with the languages behind a menu.
 * It replaces the old two-button group (and the phone-only cycling button that group needed): a globe
 * plus two letters is narrower than the group, and the list is the only place a flag and a language's
 * own name both fit, so a reader who does not read the current interface language can still find
 * theirs. Closing follows the header's search dropdown — outside click and Escape, with focus back on
 * the box — and the arrow keys walk the list, which is what `role="menu"` promises.
 */
export default function LanguageToggle() {
  const { locale, setLocale, t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /** Set by the key that opened the menu, so the first arrow press lands on an option. */
  const focusOnOpenRef = useRef<"first" | "last" | null>(null);

  function menuItems(): HTMLButtonElement[] {
    return menuItemsWithin(containerRef.current);
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (focusOnOpenRef.current) {
      const items = menuItemsWithin(containerRef.current);
      const target =
        focusOnOpenRef.current === "first" ? items[0] : items[items.length - 1];

      focusOnOpenRef.current = null;
      target?.focus();
    }

    function onMouseDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  function choose(option: Locale) {
    setLocale(option);
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }

    const items = menuItems();

    if (items.length === 0) {
      return;
    }

    event.preventDefault();

    const currentIndex = items.findIndex(
      (item) => item === document.activeElement,
    );
    const lastIndex = items.length - 1;
    let nextIndex: number;

    if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = lastIndex;
    } else if (currentIndex === -1) {
      nextIndex = event.key === "ArrowDown" ? 0 : lastIndex;
    } else {
      const step = event.key === "ArrowDown" ? 1 : -1;
      nextIndex = (currentIndex + step + items.length) % items.length;
    }

    items[nextIndex]?.focus();
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    event.preventDefault();
    focusOnOpenRef.current = event.key === "ArrowDown" ? "first" : "last";
    setIsOpen(true);
  }

  const menuLabel = t("language.group");

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={t("language.change", { current: LOCALE_LABELS[locale] })}
        title={t("language.change", { current: LOCALE_LABELS[locale] })}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-surface px-2 text-slate-600 transition-colors hover:bg-slate-50"
      >
        <Globe size={15} className="text-slate-500" aria-hidden="true" />
        <span className="text-[11px] font-semibold">{SHORT_CODES[locale]}</span>
        <ChevronDown
          size={12}
          aria-hidden="true"
          className={`text-slate-400 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Anchored to the box and right-aligned: the control sits at the end of the header on a wide
          screen and at the end of the card header on `/login` and `/register`. */}
      {isOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label={menuLabel}
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-full z-50 mt-1.5 w-44 rounded-xl border border-slate-200/80 bg-surface p-1 shadow-lg"
        >
          {LOCALES.map((option) => {
            const isActive = option === locale;

            return (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => choose(option)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                  isActive
                    ? "bg-blue-50 font-semibold text-primary"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <LocaleFlag locale={option} />
                <span className="min-w-0 flex-1 truncate">
                  {LOCALE_LABELS[option]}
                </span>
                {isActive && (
                  <Check size={13} className="shrink-0" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
