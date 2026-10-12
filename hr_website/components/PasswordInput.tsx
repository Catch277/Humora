"use client";

import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useState } from "react";

import { useLocale } from "@/components/LocaleProvider";

/**
 * A password field with a show/hide switch.
 *
 * Every password field in the app renders through this component: the four screens that ask for one
 * (`/login`, `/register` ×2, `/change-password` ×2, `/reset-password` ×2) had four copies of the same
 * "icon + input" markup, and the toggle would have been a fifth detail to keep in step. The switch is a
 * *local* `useState` on purpose: nothing outside the field needs to know whether the value is visible,
 * and keeping it here means a screen cannot forget to reset it when the form is cleared.
 *
 * It reveals the value by switching the input's `type`, not by re-rendering it as a paragraph: the field
 * stays a real `type="password"` for a password manager, the browser's own autofill and the mobile
 * keyboard, and `type="text"` only while the reader asked to see it.
 */
type PasswordInputProps = {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  /** `current-password` on a sign-in form, `new-password` wherever a new one is chosen. */
  autoComplete?: string;
  placeholder?: string;
  minLength?: number;
  required?: boolean;
};

export default function PasswordInput({
  value,
  onChange,
  name,
  autoComplete = "current-password",
  placeholder = "••••••••",
  minLength,
  required = true,
}: PasswordInputProps) {
  const { t } = useLocale();
  const [revealed, setRevealed] = useState(false);
  const label = revealed ? t("common.hidePassword") : t("common.showPassword");

  return (
    <div className="relative mt-1">
      <KeyRound
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
      <input
        type={revealed ? "text" : "password"}
        name={name}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-11 text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-blue-500/15"
      />
      <button
        type="button"
        onClick={() => setRevealed((current) => !current)}
        aria-label={label}
        // `aria-pressed` is what tells a screen reader the switch has two states, not just a label.
        aria-pressed={revealed}
        title={label}
        // 36px hit area: the touch-target rule of DESIGN.md §4.4, while the icon stays 15px so the field
        // does not grow.
        className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-50 hover:text-primary focus-visible:ring-2 focus-visible:ring-blue-500/25"
      >
        {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}
