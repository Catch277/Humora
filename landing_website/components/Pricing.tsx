import PricingCalculator from "./pricing/PricingCalculator";
import { MIN_FEE, PLANS, TIERS, formatVnd } from "./pricing/data";

export default function Pricing() {
  return (
    <section id="pricing" className="bg-surface py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <h2 className="mx-auto max-w-3xl font-heading text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">
            Bảng giá rõ ràng, tính theo số nhân viên
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-body">
            Công ty càng đông, giá mỗi người càng giảm. Phí tối thiểu cho mọi công ty là{" "}
            <strong className="font-semibold text-ink">{formatVnd(MIN_FEE)} ₫/tháng</strong>.
          </p>
        </div>

        <div className="mt-12">
          <PricingCalculator />
        </div>

        {/* Bảng đầy đủ theo quy mô */}
        <details className="group mx-auto mt-10 max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-soft">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-6 py-4 font-heading font-bold text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden">
            Xem bảng giá đầy đủ theo quy mô
            <svg viewBox="0 0 20 20" className="size-5 shrink-0 text-blue-600 transition-transform duration-300 group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 8l5 5 5-5" />
            </svg>
          </summary>

          <div className="overflow-x-auto px-4 pb-5 sm:px-6">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <caption className="pb-3 text-left text-sm text-body">Đơn vị: đồng / người / tháng</caption>
              <thead>
                <tr className="bg-surface text-left text-ink">
                  <th scope="col" className="rounded-l-lg px-4 py-3 font-semibold">Quy mô</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Số nhân viên</th>
                  {PLANS.map((p, i) => (
                    <th key={p.id} scope="col" className={`px-4 py-3 text-right font-semibold ${i === PLANS.length - 1 ? "rounded-r-lg" : ""}`}>
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {TIERS.map((t) => (
                  <tr key={t.id}>
                    <th scope="row" className="px-4 py-3 text-left font-semibold text-ink">{t.name}</th>
                    <td className="px-4 py-3 text-body">{t.min} – {t.max}</td>
                    {PLANS.map((p) => (
                      <td key={p.id} className="px-4 py-3 text-right tabular-nums text-ink">{formatVnd(t.prices[p.id])}</td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="px-4 py-3 text-left font-semibold text-ink">Doanh nghiệp</th>
                  <td className="px-4 py-3 text-body">trên 500</td>
                  <td colSpan={PLANS.length} className="px-4 py-3 text-center text-body">Liên hệ báo giá riêng</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}