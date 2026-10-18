import Link from "next/link";

const ASSURANCES = ["Không cần thẻ tín dụng", "Huỷ bất cứ lúc nào"];

export default function FinalCta() {
  return (
    <section id="cta" className="bg-surface px-6 py-20 sm:py-28">
      <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-brand-deep px-6 py-16 text-center sm:px-12 sm:py-20">
        {/* Hai vệt sáng để khối xanh đậm không bị phẳng */}
        <div aria-hidden="true" className="absolute -left-24 -top-24 -z-10 size-80 rounded-full bg-blue-600/50 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-32 -right-16 -z-10 size-96 rounded-full bg-blue-500/30 blur-3xl" />

        <h2 className="mx-auto max-w-3xl font-heading text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
          Sẵn sàng lấy lại thời gian mỗi cuối tháng?
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-blue-100">
          Thiết lập trong 15 phút. Nhân viên làm quen trong ngày đầu tiên.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/contact?intent=trial"
            className="inline-flex w-full items-center justify-center rounded-xl bg-white px-7 py-3.5 text-base font-semibold text-brand-deep shadow-[0_12px_28px_-10px_rgba(0,0,0,0.5)] transition duration-200 hover:-translate-y-0.5 hover:bg-brand-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto"
          >
            Bắt đầu dùng thử miễn phí
          </Link>
          <Link
            href="/contact?intent=demo"
            className="inline-flex w-full items-center justify-center rounded-xl border border-white/40 px-7 py-3.5 text-base font-semibold text-white transition-colors duration-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto"
          >
            Nói chuyện với chuyên gia Humora
          </Link>
        </div>

        <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-blue-100">
          {ASSURANCES.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <svg viewBox="0 0 20 20" className="size-4 text-emerald-300" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 10.5l3.2 3.2L15 7" />
              </svg>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}