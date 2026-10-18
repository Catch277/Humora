import Image from "next/image";
import Link from "next/link";

const COLUMNS = [
  {
    title: "Sản phẩm",
    links: [
      { label: "Tính năng", href: "/#features" },
      { label: "Giải pháp", href: "/#solution" },
      { label: "Cách hoạt động", href: "/#how" },
      { label: "Bảng giá", href: "/#pricing" },
      { label: "Câu hỏi thường gặp", href: "/#faq" },
    ],
  },
  {
    title: "Công ty",
    links: [
      { label: "Đội ngũ", href: "/team" },
      { label: "Liên hệ", href: "/contact" },
      { label: "Đặt lịch Demo", href: "/contact?intent=demo" },
    ],
  },
  {
    title: "Pháp lý",
    links: [
      { label: "Chính sách bảo mật", href: "/privacy" },
      { label: "Điều khoản sử dụng", href: "/terms" },
    ],
  },
];

const linkClass =
  "rounded text-sm text-body transition-colors hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-surface">
      <div className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid gap-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          {/* Thương hiệu */}
          <div>
            <Link href="/" className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">
              <Image src="/logo.png" alt="" width={223} height={175} priority className="h-10 w-auto" />
              <span className="font-heading text-xl font-extrabold tracking-tight text-ink">Humora</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-body">
              Nền tảng quản lý nhân sự và ca làm việc: chấm công Face ID, xếp ca thông minh,
              tính lương tự động.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="font-heading text-sm font-bold text-ink">{col.title}</p>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className={linkClass}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-slate-200 pt-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Humora. Bảo lưu mọi quyền.</p>
          <p>Đồ án môn học tại HUFLIT</p>
        </div>
      </div>
    </footer>
  );
}