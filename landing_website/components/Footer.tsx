import Image from "next/image";
import Link from "next/link";

/* ─────────────────────────────────────────────────────────────
   Footer kiểu "thông tin tập trung" như các site doanh nghiệp:
   nền tối, 4 cột chữ sáng, tiêu đề in hoa, hotline 24/7 nổi bật,
   đường kẻ ngang rồi dòng bản quyền.

   Chỉ dùng kênh liên hệ có thật của Humora — không thêm mạng xã hội
   hay địa chỉ chưa có.
   ───────────────────────────────────────────────────────────── */

const COMPANY = "Công ty TNHH Humora";

const SERVICE_LINKS = [
  { label: "Tính năng", href: "/#features" },
  { label: "Giải pháp", href: "/#solution" },
  { label: "Cách hoạt động", href: "/#how" },
  { label: "Bảng giá", href: "/#pricing" },
  { label: "Câu hỏi thường gặp", href: "/#faq" },
];

const POLICY_LINKS = [
  { label: "Chính sách bảo mật", href: "/privacy" },
  { label: "Điều khoản sử dụng", href: "/terms" },
  { label: "Đội ngũ Humora", href: "/team" },
  { label: "Liên hệ", href: "/contact" },
];

const HOTLINE = "0352 580 996";
const HOTLINE_HREF = "tel:0352580996";
const EMAIL = "phamhoang5552000@gmail.com";
const WEBSITE = "humoraa.id.vn";

const SLOGAN = ["Nhân sự", "Chấm công", "Tăng trưởng"];

const iconProps = {
  viewBox: "0 0 24 24",
  className: "size-4",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const SOCIALS = [
  {
    label: `Gọi ${HOTLINE}`,
    href: HOTLINE_HREF,
    external: false,
    icon: (
      <svg {...iconProps}>
        <path d="M4.5 5.5A2 2 0 0 1 6.5 3.5h1.9a1 1 0 0 1 1 .8l.8 3a1 1 0 0 1-.5 1.1l-1.4.7a11 11 0 0 0 5.6 5.6l.7-1.4a1 1 0 0 1 1.1-.5l3 .8a1 1 0 0 1 .8 1v1.9a2 2 0 0 1-2 2A15.5 15.5 0 0 1 4.5 5.5z" />
      </svg>
    ),
  },
  {
    label: `Email ${EMAIL}`,
    href: `mailto:${EMAIL}`,
    external: false,
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3.5 6.5 8.5 6 8.5-6" />
      </svg>
    ),
  },
  {
    label: `Website ${WEBSITE}`,
    href: "https://humoraa.id.vn",
    external: true,
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.5 12h17M12 3.5c2.3 2.5 3.5 5.3 3.5 8.5s-1.2 6-3.5 8.5c-2.3-2.5-3.5-5.3-3.5-8.5s1.2-6 3.5-8.5z" />
      </svg>
    ),
  },
];

const linkClass =
  "inline-block rounded text-sm leading-relaxed text-blue-100/75 transition-colors duration-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/* Tiêu đề cột: in hoa, có gạch nhấn ngắn bên dưới */
function ColumnTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-heading text-sm font-bold uppercase tracking-[0.12em] text-white">
      {children}
      <span aria-hidden="true" className="mt-3 block h-0.5 w-8 rounded-full bg-blue-500" />
    </h2>
  );
}

export default function Footer() {
  return (
    <footer className="relative isolate overflow-hidden bg-[#081c2e] text-white">
      {/* Ánh sáng nền, giữ khối tối không bị phẳng */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_120%_at_15%_0%,rgba(37,99,235,0.28),transparent_60%),radial-gradient(55%_90%_at_90%_10%,rgba(16,185,129,0.14),transparent_65%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.16] [background-image:linear-gradient(to_right,rgba(255,255,255,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]"
      />

      <div className="mx-auto max-w-7xl px-6 pb-8 pt-14 sm:pt-16">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-[1.55fr_1fr_1fr_1.15fr] lg:gap-8">
          {/* ── Thông tin liên hệ ── */}
          <div className="col-span-2 lg:col-span-1">
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              <span className="grid h-11 shrink-0 place-items-center rounded-xl bg-white px-2">
                <Image src="/logo.png" alt="" width={223} height={175} priority className="h-8 w-auto object-contain" />
              </span>
              <span className="font-heading text-xl font-extrabold tracking-tight text-white">Humora</span>
            </Link>

            <h2 className="mt-6 font-heading text-sm font-bold uppercase tracking-[0.12em] text-white">
              Thông tin liên hệ
              <span aria-hidden="true" className="mt-3 block h-0.5 w-8 rounded-full bg-blue-500" />
            </h2>

            <p className="mt-4 font-heading text-base font-semibold text-white">{COMPANY}</p>

            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-blue-100/75">
              <li>
                Hotline:{" "}
                <a href={HOTLINE_HREF} className="rounded font-semibold text-white transition-colors hover:text-blue-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                  {HOTLINE}
                </a>
              </li>
              <li className="break-all">
                Email:{" "}
                <a href={`mailto:${EMAIL}`} className="rounded font-semibold text-white transition-colors hover:text-blue-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                  {EMAIL}
                </a>
              </li>
              <li>
                Website:{" "}
                <a
                  href="https://humoraa.id.vn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded font-semibold text-white transition-colors hover:text-blue-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {WEBSITE}
                </a>
              </li>
            </ul>

            {/* Slogan */}
            <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-300">
              {SLOGAN.map((word, i) => (
                <span key={word} className="flex items-center gap-2">
                  {i > 0 && <span aria-hidden="true" className="size-1 rounded-full bg-blue-300/40" />}
                  {word}
                </span>
              ))}
            </p>
          </div>

          {/* ── Dịch vụ ── */}
          <nav aria-label="Dịch vụ">
            <ColumnTitle>Dịch vụ</ColumnTitle>
            <ul className="mt-4 space-y-2.5">
              {SERVICE_LINKS.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className={linkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* ── Chính sách ── */}
          <nav aria-label="Chính sách">
            <ColumnTitle>Chính sách</ColumnTitle>
            <ul className="mt-4 space-y-2.5">
              {POLICY_LINKS.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className={linkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* ── Hỗ trợ khách hàng ── */}
          <div className="col-span-2 lg:col-span-1">
            <ColumnTitle>Hỗ trợ khách hàng</ColumnTitle>

            <div className="mt-4 space-y-3.5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-300">
                  Tư vấn dịch vụ 24/7
                </p>
                <a
                  href={HOTLINE_HREF}
                  className="mt-0.5 inline-block rounded font-heading text-xl font-extrabold tabular-nums text-white transition-colors hover:text-blue-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {HOTLINE}
                </a>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-300">
                  Phản hồi, góp ý
                </p>
                <a
                  href={`mailto:${EMAIL}`}
                  className="mt-0.5 inline-block break-all rounded text-sm font-semibold text-white transition-colors hover:text-blue-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {EMAIL}
                </a>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-300">Kết nối</p>
                <ul className="mt-2 flex items-center gap-2">
                  {SOCIALS.map((s) => (
                    <li key={s.label}>
                      <a
                        href={s.href}
                        aria-label={s.label}
                        className="grid size-9 place-items-center rounded-lg border border-white/15 bg-white/5 text-blue-100 transition-colors hover:border-blue-400 hover:bg-blue-600 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                        {...(s.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      >
                        {s.icon}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <Link
                href="/contact?intent=demo"
                className="inline-flex items-center gap-1.5 rounded text-sm font-semibold text-blue-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Đặt lịch Demo 20 phút
                <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 10h12M11 5l5 5-5 5" />
                </svg>
              </Link>
            </div>
          </div>
        </div>

        {/* Đường kẻ + bản quyền (giữ bên phải như đã chốt, bên trái để trống) */}
        <div className="mt-10 flex justify-end border-t border-white/12 pt-5 text-sm text-blue-100/60">
          <p>© {new Date().getFullYear()} Humora. Bảo lưu mọi quyền.</p>
        </div>
      </div>
    </footer>
  );
}
