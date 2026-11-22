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

function Check() {
  return (
    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success/15 text-emerald-700">
      <svg viewBox="0 0 20 20" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 10.5l3.2 3.2L15 7" />
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
      PLANS.map((p) => `${p.name} ${formatVnd(quote(count, p.id)!.total)} đồng (${p.short})`).join(", ") +
      "."
    : "";

  return (
    <div>
      {/* Bộ chọn số nhân viên */}
      <div className="mx-auto max-w-3xl">
        <label htmlFor="employees" className="mb-3 block text-right text-sm font-semibold text-ink sm:text-base">
          {count} nhân viên <span className="font-normal text-body">(Quy mô {tier ? tier.name.toLowerCase() : "doanh nghiệp"})</span>
        </label>
        <input
          id="employees"
          type="range"
          min={1}
          max={MAX_STANDARD + 1}
          step={1}
          value={count}
          onChange={(e) => setRaw(e.target.value)}
          aria-label="Kéo để chọn số nhân viên"
          aria-valuetext={`${count} nhân viên (Quy mô ${tier ? tier.name.toLowerCase() : "doanh nghiệp"})`}
          className="block w-full accent-blue-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
        />
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
        <div className="mt-5 grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => {
            const q = valid ? quote(count, plan.id) : null;
            return (
              <article
                key={plan.id}
                className="flex flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-soft transition-all duration-300 ease-out hover:-translate-y-1 hover:border-blue-600/30 hover:shadow-[0_24px_48px_-20px_rgba(37,99,235,0.35)] motion-reduce:hover:translate-y-0 sm:p-6"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-heading text-xl font-bold text-ink">{plan.name}</h3>
                  {q && q.savingsPercent > 0 && (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-emerald-700">
                      Tiết kiệm {q.savingsPercent}%
                    </span>
                  )}
                </div>
                <p className="mt-1 min-h-10 text-sm leading-snug text-body">{plan.tagline}</p>

                <p className="mt-3 flex flex-wrap items-baseline gap-1.5">
                  <span className="font-heading text-4xl font-extrabold tabular-nums tracking-tight text-ink">
                    {q ? formatVnd(q.perPerson) : "—"}
                  </span>
                  <span className="text-sm text-body">{plan.unitLabel}</span>
                </p>

                <div className="mt-3 rounded-xl bg-brand-mist/70 px-4 py-2.5">
                  <p className="text-sm text-body">{plan.totalLabel}</p>
                  <p className="font-heading text-2xl font-extrabold tabular-nums text-blue-700">
                    {q ? `${formatVnd(q.total)} ₫` : "—"}
                  </p>
                  {q && q.savings > 0 && (
                    <p className="mt-1 text-xs font-medium text-emerald-700">
                      Tương đương {formatVnd(q.monthlyTotal)} ₫/tháng · tiết kiệm {formatVnd(q.savings)} ₫
                    </p>
                  )}
                  {q?.minApplied && (
                    <p className="mt-1 text-xs font-medium text-amber-700">
                      Đã áp dụng phí tối thiểu {formatVnd(MIN_FEE)} ₫{plan.periodSuffix}
                    </p>
                  )}
                </div>

                <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                  <li className="font-semibold text-ink">Ứng dụng di động (Android &amp; iOS)</li>
                  {APP_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-body">
                      <Check />
                      {f}
                    </li>
                  ))}
                  <li className="pt-2 font-semibold text-ink">Web quản trị</li>
                  {WEB_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-body">
                      <Check />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href={`/payment?plan=${plan.id}${employeesQuery}`}
                  className="mt-4 inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-base font-semibold text-white shadow-[0_10px_24px_-8px_rgba(37,99,235,0.65)] transition duration-200 hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  Thanh toán ngay
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}