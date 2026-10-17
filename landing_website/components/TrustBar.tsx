import type { ReactNode } from "react";

/* ─────────────────────────────────────────────────────────
   Khi có khách hàng thật, điền tên vào mảng này (hoặc thay bằng <Image> logo).
   Mảng rỗng → thanh này hiển thị 4 điểm mạnh có thật của sản phẩm,
   KHÔNG đăng logo/số liệu chưa có.
   ───────────────────────────────────────────────────────── */
const CUSTOMERS: string[] = [];

const iconProps = {
  viewBox: "0 0 24 24",
  className: "size-5 shrink-0 text-blue-600",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const CAPABILITIES: { label: string; icon: ReactNode }[] = [
  {
    label: "Chấm công Face ID",
    icon: (
      <svg {...iconProps}>
        <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
        <path d="M9 10v1M15 10v1M9.5 15c.7.7 1.5 1 2.5 1s1.8-.3 2.5-1" />
      </svg>
    ),
  },
  {
    label: "Định vị GPS / WiFi",
    icon: (
      <svg {...iconProps}>
        <path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    ),
  },
  {
    label: "Phân quyền theo vai trò",
    icon: (
      <svg {...iconProps}>
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    label: "Giao diện tiếng Việt",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
      </svg>
    ),
  },
];

export default function TrustBar() {
  const hasCustomers = CUSTOMERS.length > 0;

  return (
    <section
      aria-label="Điểm nổi bật của Humora"
      className="border-y border-slate-200/70 bg-white"
    >
      <div className="mx-auto max-w-7xl px-6 py-8">
        <p className="text-center text-sm font-medium text-body">
          {hasCustomers
            ? "Được các chuỗi cửa hàng F&B, bán lẻ và dịch vụ tin dùng"
            : "Nền tảng nhân sự dành cho chuỗi F&B, bán lẻ và dịch vụ"}
        </p>

        <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
          {hasCustomers
            ? CUSTOMERS.map((name) => (
                <li
                  key={name}
                  className="font-heading text-lg font-bold text-slate-400 transition-colors hover:text-ink"
                >
                  {name}
                </li>
              ))
            : CAPABILITIES.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-2.5 text-sm font-semibold text-ink"
                >
                  {item.icon}
                  {item.label}
                </li>
              ))}
        </ul>
      </div>
    </section>
  );
}