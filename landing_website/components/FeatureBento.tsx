import type { ReactNode } from "react";
import CountUp from "./bento/CountUp";
import ShiftApproval from "./bento/ShiftApproval";

/* ── Khung 1 ô Bento ──────────────────────────────────────── */
function Tile({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <article
      className={`flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-soft transition-all duration-300 ease-out hover:-translate-y-1 hover:border-blue-600/30 hover:shadow-[0_24px_48px_-20px_rgba(37,99,235,0.35)] motion-reduce:hover:translate-y-0 sm:p-8 ${className}`}
    >
      {children}
    </article>
  );
}

function TileHeader({
  icon,
  name,
  title,
  text,
}: {
  icon: ReactNode;
  name: string;
  title: string;
  text: string;
}) {
  return (
    <header>
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-brand-mist text-blue-600">
          {icon}
        </span>
        <p className="text-sm font-semibold text-blue-600">{name}</p>
      </div>
      <h3 className="mt-5 font-heading text-2xl font-bold leading-snug tracking-tight text-ink">
        {title}
      </h3>
      <p className="mt-3 leading-relaxed text-body">{text}</p>
    </header>
  );
}

const ic = {
  viewBox: "0 0 24 24",
  className: "size-5",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/* ── Ô A: Face ID – khung camera giả lập ──────────────────── */
function FaceScanVisual() {
  const corner = "absolute size-8 border-success";
  return (
    <div
      aria-hidden="true"
      className="relative mt-8 grid min-h-72 flex-1 place-items-center overflow-hidden rounded-2xl bg-[radial-gradient(70%_80%_at_50%_35%,#1e3a8a_0%,#0f172a_75%)]"
    >
      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
        <span className="size-2 animate-pulse rounded-full bg-success" />
        Face ID
      </div>

      <div className="relative size-48 overflow-hidden rounded-3xl sm:size-56">
        <span className={`${corner} left-0 top-0 rounded-tl-2xl border-l-[3px] border-t-[3px]`} />
        <span className={`${corner} right-0 top-0 rounded-tr-2xl border-r-[3px] border-t-[3px]`} />
        <span className={`${corner} bottom-0 left-0 rounded-bl-2xl border-b-[3px] border-l-[3px]`} />
        <span className={`${corner} bottom-0 right-0 rounded-br-2xl border-b-[3px] border-r-[3px]`} />

        <svg viewBox="0 0 64 64" className="absolute inset-0 m-auto size-3/5 text-white/75" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="32" cy="24" r="11" />
          <path d="M10 56c2-12 11-18 22-18s20 6 22 18" />
        </svg>

        <div className="absolute inset-x-0 top-0 h-1/4 animate-scan border-b-2 border-success bg-gradient-to-b from-transparent to-success/30" />
      </div>

      <div className="absolute inset-x-4 bottom-4 flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-md">
        <span className="grid size-8 place-items-center rounded-full bg-success text-white">
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 10.5l3.2 3.2L15 7" />
          </svg>
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">Xác thực thành công</p>
          <p className="text-xs text-white/60">Nhân viên A</p>
        </div>
        <p className="ml-auto font-heading text-lg font-bold tabular-nums text-white">08:02</p>
      </div>
    </div>
  );
}

/* ── Ô B: GPS / WiFi – vùng cho phép chấm công ────────────── */
function GeofenceVisual() {
  return (
    <div
      aria-hidden="true"
      className="relative mt-6 h-48 overflow-hidden rounded-2xl bg-brand-mist bg-[linear-gradient(to_right,rgba(37,99,235,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(37,99,235,0.08)_1px,transparent_1px)] bg-size-[24px_24px]"
    >
      <div className="absolute left-1/2 top-1/2 size-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-blue-600/50 bg-blue-600/10">
        <span className="absolute inset-0 animate-ripple rounded-full border border-blue-600/60 bg-blue-600/20" />
        <span className="absolute inset-0 animate-ripple rounded-full border border-blue-600/60 bg-blue-600/20 [animation-delay:1.6s]" />
        <svg viewBox="0 0 24 24" className="absolute inset-0 m-auto size-8 text-blue-600 drop-shadow" fill="currentColor">
          <path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
        </svg>
        <span className="absolute left-[64%] top-[66%] size-2.5 rounded-full bg-success ring-4 ring-success/25" />
      </div>
      <span className="absolute right-[12%] top-[18%] size-2.5 rounded-full bg-warning ring-4 ring-warning/25" />

      <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-soft">
        <span className="size-1.5 rounded-full bg-success" />
        Trong phạm vi
      </span>
      <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-700 shadow-soft">
        <span className="size-1.5 rounded-full bg-warning" />
        Ngoài phạm vi
      </span>
      <span className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-ink shadow-soft">
        <svg viewBox="0 0 24 24" className="size-3.5 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0" />
          <circle cx="12" cy="19.5" r="0.8" fill="currentColor" />
        </svg>
        WiFi cửa hàng
      </span>
    </div>
  );
}

/* ── Ô D: Bảng lương – số đếm khi cuộn tới ────────────────── */
function PayslipVisual() {
  const lines = [
    { label: "Lương theo giờ công", amount: "112.000.000", dot: "bg-blue-600" },
    { label: "Tăng ca", amount: "12.450.000", dot: "bg-success" },
    { label: "Phụ cấp", amount: "4.000.000", dot: "bg-slate-400" },
  ];
  return (
    <div className="rounded-2xl bg-surface p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-body">Bảng lương tháng 10</p>
        <span className="flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          <span className="size-1.5 rounded-full bg-success" />
          Đã chốt
        </span>
      </div>

      <p className="mt-3 font-heading text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
        <CountUp to={128450000} /> <span className="text-2xl text-slate-400 sm:text-3xl">₫</span>
      </p>

      <div aria-hidden="true" className="mt-5 flex h-2 overflow-hidden rounded-full bg-slate-200">
        <span className="h-full bg-blue-600" style={{ width: "87.2%" }} />
        <span className="h-full bg-success" style={{ width: "9.7%" }} />
        <span className="h-full bg-slate-400" style={{ width: "3.1%" }} />
      </div>

      <ul className="mt-4 space-y-2.5">
        {lines.map((l) => (
          <li key={l.label} className="flex items-center gap-2.5 text-sm">
            <span className={`size-2 rounded-full ${l.dot}`} aria-hidden="true" />
            <span className="text-body">{l.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-ink">{l.amount} ₫</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Section ──────────────────────────────────────────────── */
export default function FeatureBento() {
  return (
    <section id="features" className="bg-surface py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <h2 className="mx-auto max-w-3xl text-center font-heading text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">
          Mọi thứ bạn cần để vận hành đội ngũ, không phải cài thêm gì
        </h2>

        {/* 12 cột (desktop): A 7×2 · B 5×1 · C 5×1 · D 12 ngang. Mobile: 1 cột */}
        <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* A – Face ID */}
          <Tile className="lg:col-span-7 lg:row-span-2">
            <TileHeader
              icon={
                <svg {...ic}>
                  <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
                  <path d="M9 10v1M15 10v1M9.5 15c.7.7 1.5 1 2.5 1s1.8-.3 2.5-1" />
                </svg>
              }
              name="Chấm công Face ID"
              title="Không thể chấm công hộ"
              text="Nhận diện khuôn mặt chỉ trong vài giây. Mỗi lượt chấm công đều gắn với đúng một người, kèm thời gian thực."
            />
            <ul className="mt-5 flex flex-wrap gap-2">
              {["Chống gian lận", "Nhanh", "Không chạm"].map((chip) => (
                <li key={chip} className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-sm font-medium text-emerald-700">
                  <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 10.5l3.2 3.2L15 7" />
                  </svg>
                  {chip}
                </li>
              ))}
            </ul>
            <FaceScanVisual />
          </Tile>

          {/* B – GPS / WiFi */}
          <Tile className="lg:col-span-5">
            <TileHeader
              icon={
                <svg {...ic}>
                  <path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11z" />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
              }
              name="Chấm công GPS / WiFi"
              title="Đúng người, đúng nơi làm việc"
              text="Chỉ cho chấm công trong bán kính cửa hàng hoặc mạng WiFi được chỉ định. Mở nhiều chi nhánh vẫn kiểm soát được."
            />
            <GeofenceVisual />
          </Tile>

          {/* C – Duyệt ca */}
          <Tile className="lg:col-span-5">
            <TileHeader
              icon={
                <svg {...ic}>
                  <rect x="3" y="5" width="18" height="16" rx="3" />
                  <path d="M8 3v4M16 3v4M3 10h18M9 16l2 2 4-4" />
                </svg>
              }
              name="Quản lý & duyệt ca thông minh"
              title="Xếp ca trong vài phút, duyệt đơn một chạm"
              text="Đăng ca trống, nhân viên tự đăng ký, quản lý duyệt ngay trên điện thoại. Hết cảnh nhắn tin chéo."
            />
            <ShiftApproval />
          </Tile>

          {/* D – Tính lương (ngang, 12 cột) */}
          <Tile className="lg:col-span-12">
            <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
              <div>
                <TileHeader
                  icon={
                    <svg {...ic}>
                      <rect x="3" y="6" width="18" height="12" rx="2.5" />
                      <circle cx="12" cy="12" r="2.5" />
                      <path d="M6.5 9.5v.01M17.5 14.5v.01" />
                    </svg>
                  }
                  name="Tính lương tự động"
                  title="Chốt lương chính xác 100%, không cần mở Excel"
                  text="Dữ liệu chấm công, tăng ca, nghỉ phép chảy thẳng vào bảng lương. Bạn chỉ cần kiểm tra và xác nhận."
                />
                <ul className="mt-5 flex flex-wrap gap-2">
                  {["Giờ công", "Tăng ca", "Nghỉ phép"].map((chip) => (
                    <li key={chip} className="rounded-full border border-blue-600/20 bg-brand-mist px-3 py-1 text-sm font-medium text-blue-700">
                      {chip}
                    </li>
                  ))}
                </ul>
              </div>
              <PayslipVisual />
            </div>
          </Tile>
        </div>
      </div>
    </section>
  );
}