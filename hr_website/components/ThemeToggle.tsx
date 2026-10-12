"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

import { useLocale } from "@/components/LocaleProvider";
import type { MessageKey } from "@/lib/i18n/translate";

/** Khoá lưu lựa chọn giao diện; đọc lại bởi script trong `app/layout.tsx` trước khi vẽ trang. */
const STORAGE_KEY = "humora-theme";
/** Sự kiện nội bộ để `useSyncExternalStore` biết lựa chọn vừa đổi trong cùng tab. */
const CHOICE_EVENT = "humora-theme-change";

type ThemeChoice = "light" | "dark" | "system";

const OPTIONS: { value: ThemeChoice; labelKey: MessageKey; Icon: typeof Sun }[] = [
  { value: "light", labelKey: "theme.light", Icon: Sun },
  { value: "dark", labelKey: "theme.dark", Icon: Moon },
  { value: "system", labelKey: "theme.system", Icon: Monitor },
];

/** The cycle the phone button walks through: Sáng → Tối → Theo hệ thống → Sáng. */
const NEXT_CHOICE: Record<ThemeChoice, ThemeChoice> = {
  light: "dark",
  dark: "system",
  system: "light",
};

function readChoice(): ThemeChoice {
  const stored = window.localStorage.getItem(STORAGE_KEY);

  return stored === "light" || stored === "dark" ? stored : "system";
}

function subscribeToChoice(onChange: () => void): () => void {
  // `storage` fires for other tabs; the custom event covers this one.
  window.addEventListener("storage", onChange);
  window.addEventListener(CHOICE_EVENT, onChange);

  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHOICE_EVENT, onChange);
  };
}

function readSystemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function subscribeToSystemTheme(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);

  return () => media.removeEventListener("change", onChange);
}

/**
 * Bộ chuyển giao diện Sáng / Tối / Theo hệ thống.
 *
 * Lựa chọn nằm trong `localStorage` và trạng thái hệ điều hành được đọc qua `useSyncExternalStore`,
 * nên không có `setState` nào chạy trong thân effect (React 19 khuyến nghị tránh việc đó) và bản render
 * phía server luôn dùng "system" mà không lệch hydration.
 */
export default function ThemeToggle() {
  const { t } = useLocale();
  const choice = useSyncExternalStore(
    subscribeToChoice,
    readChoice,
    () => "system" as ThemeChoice,
  );
  const systemPrefersDark = useSyncExternalStore(
    subscribeToSystemTheme,
    readSystemPrefersDark,
    () => false,
  );

  // Gắn/bỏ lớp `.dark`: đây là cập nhật ra hệ thống bên ngoài, không phải state của React.
  useEffect(() => {
    const isDark =
      choice === "dark" || (choice === "system" && systemPrefersDark);

    document.documentElement.classList.toggle("dark", isDark);
  }, [choice, systemPrefersDark]);

  function choose(next: ThemeChoice) {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage bị chặn: lựa chọn vẫn có hiệu lực cho phiên này */
    }

    window.dispatchEvent(new Event(CHOICE_EVENT));
  }

  const active = OPTIONS.find((option) => option.value === choice) ?? OPTIONS[2];
  const ActiveIcon = active.Icon;

  return (
    <>
      {/*
        Below `md` the header has no room for three choices beside the hamburger, the search box, the bell
        and sign-out, so one button walks the same three options. The group returns on a wide screen, where
        showing all three at once is the point.
      */}
      <button
        type="button"
        onClick={() => choose(NEXT_CHOICE[choice])}
        aria-label={t("theme.change", { current: t(active.labelKey) })}
        title={t(active.labelKey)}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-surface text-slate-600 transition-colors hover:bg-slate-50 md:hidden"
      >
        <ActiveIcon size={15} />
      </button>

      <div
        role="group"
        aria-label={t("theme.group")}
        className="hidden items-center gap-0.5 rounded-lg border border-slate-200 bg-surface-muted p-0.5 md:flex"
      >
        {OPTIONS.map(({ value, labelKey, Icon }) => {
          const isActive = choice === value;

          return (
            <button
              key={value}
              type="button"
              onClick={() => choose(value)}
              aria-pressed={isActive}
              title={t(labelKey)}
              className={`rounded-md p-1.5 transition-colors ${
                isActive
                  ? "bg-surface text-primary shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Icon size={14} />
              <span className="sr-only">{t(labelKey)}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
