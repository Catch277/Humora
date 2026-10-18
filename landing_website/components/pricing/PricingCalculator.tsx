"use client";

import { useState } from "react";
import Link from "next/link";
import {
  APP_FEATURES,
  MAX_STANDARD,
  MIN_FEE,
  PLANS,
  WEB_FEATURES,
  formatVnd,
  quote,
  tierFor,
} from "./data";

const PRESETS = [10, 30, 100, 300];

function Check({ muted = false }: { muted?: boolean }) {
  return (
    <span
      className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${
        muted ? "bg-slate-100 text-slate-400" : "bg-success/15 text-emerald-700"
      }`}
    >
      <svg viewBox="0 0 20 20" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {muted ? <path d="M6 6l8 8M14 6l-8 8" /> : <path d="M5 10.5l3.2 3.2L15 7" />}
      </svg>
    </span>
  );
}

export default function PricingCalculator() {
  const [raw, setRaw] = useState("30");
  const parsed = Number.parseInt(raw, 10);
  const valid = Number.isFinite(parsed) && parsed >= 1;
  const count = valid ? parsed : 0;
  const tier = valid ? tierFor(count) : null;
  const enterprise = valid && count > MAX_STANDARD;
  const employeesQuery = valid ? `&employees=${count}` : "";

  const summary = valid && !enterprise
    ? `Với ${count} nhân viên: ` +
      PLANS.map((p) => `${p.name} ${formatVnd(quote(count, p.id)!.total)} đồng mỗi tháng`).join(", ") +
      "."
    : "";

  return (
    <div>
      {/* Bộ chọn số nhân viên */}
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <label htmlFor="employees" className="text-sm font-semibold text-body">
              Số nhân viên của bạn
            </label>
            <input
              id="employees"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              value={raw}
              onChange={(e) => setRaw(e.target.value.replace(/\D/g, "").slice(0, 5))}
              aria-describedby="employees-hint"
              className="mt-2 block w-40 rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-heading text-3xl font-extrabold tabular-nums text-ink outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/15"
            />
          </div>

          <ul className="flex flex-wrap gap-2" aria-label="Chọn nhanh số nhân viên">
            {PRESETS.map((n) => (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => setRaw(String(n))}
                  aria-pressed={count === n}
                  className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                    count === n
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-300 text-body hover:border-blue-600 hover:text-blue-600"
                  }`}
                >
                  {n}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <input
          type="range"
          min={1}
          max={MAX_STANDARD}
          step={1}
          value={Math.min(Math.max(count, 1), MAX_STANDARD)}
          onChange={(e) => setRaw(e.target.value)}
          aria-label="Kéo để chọn số nhân viên"
          className="mt-6 w-full accent-blue-600"
        />

        <p id="employees-hint" className="mt-3 text-sm text-body">
          {!valid && "Nhập số nhân viên để xem tổng chi phí."}
          {valid && tier && (
            <>
              Quy mô <strong className="text-ink">{tier.name}</strong> ({tier.min}–{tier.max} nhân viên). Mức giá của
              bậc này áp dụng cho toàn bộ nhân viên.
            </>
          )}
          {enterprise && (
            <>
              Quy mô <strong className="text-ink">Doanh nghiệp</strong> (trên {MAX_STANDARD} nhân viên).
            </>
          )}
        </p>
        <p className="sr-only" aria-live="polite">{summary}</p>
      </div>

      {/* Kết quả */}
      {enterprise ? (
        <div className="mx-auto mt-8 max-w-3xl rounded-3xl bg-brand-deep p-8 text-center text-white sm:p-10">
          <h3 className="font-heading text-2xl font-bold">Liên hệ báo giá riêng</h3>
          <p className="mx-auto mt-3 max-w-lg leading-relaxed text-blue-100">
            Với trên {MAX_STANDARD} nhân viên, chúng tôi xây dựng báo giá theo quy mô và nhu cầu riêng của doanh nghiệp bạn.
          </p>
          <Link
            href={`/contact?intent=quote&plan=enterprise${employeesQuery}`}
            className="mt-7 inline-flex items-center justify-center rounded-xl bg-white px-7 py-3.5 text-base font-semibold text-brand-deep transition duration-200 hover:-translate-y-0.5 hover:bg-brand-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Nhận báo giá riêng
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => {
            const q = valid ? quote(count, plan.id) : null;
            return (
              <article
                key={plan.id}
                className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-soft transition-all duration-300 ease-out hover:-translate-y-1 hover:border-blue-600/30 hover:shadow-[0_24px_48px_-20px_rgba(37,99,235,0.35)] motion-reduce:hover:translate-y-0 sm:p-7"
              >
                <h3 className="font-heading text-xl font-bold text-ink">{plan.name}</h3>
                <p className="mt-1 min-h-10 text-sm leading-snug text-body">{plan.tagline}</p>

                <p className="mt-5 flex items-baseline gap-1.5">
                  <span className="font-heading text-4xl font-extrabold tabular-nums tracking-tight text-ink">
                    {q ? formatVnd(q.perPerson) : "—"}
                  </span>
                  <span className="text-sm text-body">₫ / người / tháng</span>
                </p>

                <div className="mt-4 rounded-xl bg-brand-mist/70 px-4 py-3">
                  <p className="text-sm text-body">Tổng mỗi tháng</p>
                  <p className="font-heading text-2xl font-extrabold tabular-nums text-blue-700">
                    {q ? `${formatVnd(q.total)} ₫` : "—"}
                  </p>
                  {q?.minApplied && (
                    <p className="mt-1 text-xs font-medium text-amber-700">
                      Đã áp dụng phí tối thiểu {formatVnd(MIN_FEE)} ₫/tháng
                    </p>
                  )}
                </div>

                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  <li className="font-semibold text-ink">Ứng dụng di động (Android &amp; iOS)</li>
                  {APP_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-body">
                      <Check />
                      {f}
                    </li>
                  ))}
                  <li className="pt-2 font-semibold text-ink">Web quản trị</li>
                  {plan.web ? (
                    WEB_FEATURES.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-body">
                        <Check />
                        {f}
                      </li>
                    ))
                  ) : (
                    <li className="flex items-start gap-2.5 text-slate-400">
                      <Check muted />
                      Không bao gồm
                    </li>
                  )}
                </ul>

                <Link
                  href={`/contact?intent=trial&plan=${plan.id}${employeesQuery}`}
                  className="mt-7 inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-base font-semibold text-white shadow-[0_10px_24px_-8px_rgba(37,99,235,0.65)] transition duration-200 hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  Dùng thử gói {plan.name}
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}