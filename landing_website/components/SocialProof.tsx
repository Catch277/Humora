import type { ReactNode } from "react";
import Link from "next/link";

/* ─────────────────────────────────────────────────────────────
   CHỈ điền khi có dữ liệu THẬT. Để mảng rỗng → section tự chuyển sang
   chế độ "Khách hàng sáng lập", không hiển thị lời chứng/số liệu giả.
   ───────────────────────────────────────────────────────────── */
const TESTIMONIALS: { quote: string; name: string; role: string; company: string }[] = [
  // { quote: "…", name: "Tên", role: "Chức danh", company: "Thương hiệu" },
];
const METRICS: { value: string; label: string }[] = [
  // { value: "…", label: "…" },
];

const si = {
  viewBox: "0 0 24 24",
  className: "size-5",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const SECURITY: { title: string; text: string; icon: ReactNode }[] = [
  {
    title: "Mã hoá dữ liệu",
    text: "Dữ liệu được truyền và lưu trữ có mã hoá.",
    icon: (
      <svg {...si}>
        <rect x="4" y="11" width="16" height="10" rx="2.5" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    ),
  },
  {
    title: "Phân quyền theo vai trò",
    text: "Mỗi người chỉ thấy đúng dữ liệu mình được phép.",
    icon: (
      <svg {...si}>
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "Dữ liệu khuôn mặt",
    text: "Chỉ dùng để xác thực chấm công, không dùng cho mục đích khác.",
    icon: (
      <svg {...si}>
        <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
        <path d="M9 10v1M15 10v1M9.5 15c.7.7 1.5 1 2.5 1s1.8-.3 2.5-1" />
      </svg>
    ),
  },
];

export default function SocialProof() {
  const hasTestimonials = TESTIMONIALS.length > 0;

  return (
    <section id="proof" className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <h2 className="mx-auto max-w-3xl text-center font-heading text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">
          {hasTestimonials
            ? "Những người đã bỏ Excel nói gì?"
            : "Cùng xây dựng Humora với những người trực tiếp vận hành"}
        </h2>

        {/* Số liệu thật (nếu có) */}
        {METRICS.length > 0 && (
          <dl className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-3">
            {METRICS.map((m) => (
              <div key={m.label} className="flex flex-col rounded-2xl bg-brand-mist/70 px-6 py-5 text-center">
                <dt className="order-2 mt-1 text-sm text-body">{m.label}</dt>
                <dd className="font-heading text-4xl font-extrabold text-blue-600">{m.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* Lời chứng thật HOẶC chương trình khách hàng sáng lập */}
        {hasTestimonials ? (
          <ul className="mt-12 grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <li key={t.name}>
                <figure className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-7 shadow-soft">
                  <blockquote className="flex-1 text-lg leading-relaxed text-ink">“{t.quote}”</blockquote>
                  <figcaption className="mt-6 border-t border-slate-100 pt-4">
                    <p className="font-semibold text-ink">{t.name}</p>
                    <p className="text-sm text-body">
                      {t.role}, {t.company}
                    </p>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mx-auto mt-12 grid max-w-4xl items-center gap-8 rounded-3xl border border-blue-600/15 bg-brand-mist/70 p-8 sm:p-10 md:grid-cols-[1fr_auto]">
            <div>
              <h3 className="font-heading text-2xl font-bold tracking-tight text-ink">
                Chương trình khách hàng sáng lập
              </h3>
              <p className="mt-3 max-w-xl leading-relaxed text-body">
                Dùng thử miễn phí, được ưu tiên hỗ trợ thiết lập, và ý kiến của bạn
                đi thẳng vào những tính năng chúng tôi làm tiếp theo.
              </p>
            </div>
            <Link
              href="/contact?intent=trial"
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white shadow-[0_10px_24px_-8px_rgba(37,99,235,0.65)] transition duration-200 hover:-translate-y-0.5 hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Đăng ký tham gia
            </Link>
          </div>
        )}

        {/* Bảo mật */}
        <ul className="mx-auto mt-14 grid max-w-5xl gap-8 md:grid-cols-3">
          {SECURITY.map((item) => (
            <li key={item.title} className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-mist text-blue-600">
                {item.icon}
              </span>
              <div>
                <p className="font-heading font-bold text-ink">{item.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-body">{item.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}