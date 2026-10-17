import Link from "next/link";
import HeroVisual from "./HeroVisual";

const TRUST_ITEMS = [
  "Không cần thẻ tín dụng",
  "Cài đặt trong 15 phút",
  "Hỗ trợ tiếng Việt",
];

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0 text-success" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="8" className="fill-success/15 stroke-none" />
      <path d="M6.5 10.5l2.2 2.2 4.8-5" />
    </svg>
  );
}

export default function Hero() {
  return (
    <section
      id="hero"
      className="relative isolate flex min-h-svh items-center overflow-hidden bg-white pb-12 pt-24 lg:pt-20"
    >
      {/* Vệt xanh mờ phía sau mockup – để lớp kính có thứ để làm mờ */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_55%_at_78%_45%,rgba(37,99,235,0.10),transparent_70%)]"
      />

      <div className="mx-auto grid w-full max-w-7xl items-center gap-14 px-6 lg:grid-cols-2 lg:gap-10">
        {/* Cột trái – nội dung */}
        <div className="max-w-xl animate-rise">
          <h1 className="font-heading text-[2.5rem] font-extrabold leading-[1.1] tracking-tight text-ink sm:text-5xl lg:text-[3.5rem]">
            Dừng chấm công bằng tay.{" "}
            <span className="block">Dành thời gian cho việc kinh doanh.</span>
          </h1>

          <p className="mt-6 max-w-lg text-lg leading-relaxed text-body">
            Humora gộp chấm công Face ID, định vị GPS/WiFi, xếp &amp; duyệt ca và
            tính lương vào một nền tảng. Bạn bớt giấy tờ, bớt tranh cãi, bớt sai
            sót.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/contact?intent=trial"
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white shadow-[0_10px_24px_-8px_rgba(37,99,235,0.65)] transition duration-200 hover:-translate-y-0.5 hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Dùng thử miễn phí 14 ngày
            </Link>
            <Link
              href="/contact?intent=demo"
              className="group inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-base font-semibold text-ink transition-colors duration-200 hover:border-blue-600 hover:bg-brand-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Đặt lịch Demo 20 phút
              <svg viewBox="0 0 20 20" className="size-4 transition-transform duration-200 group-hover:translate-x-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 10h12M11 5l5 5-5 5" />
              </svg>
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-body">
            {TRUST_ITEMS.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckIcon />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Cột phải – mockup */}
        <div className="animate-rise [animation-delay:150ms]">
          <HeroVisual />
        </div>
      </div>
    </section>
  );
}