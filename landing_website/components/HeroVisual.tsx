import type { ReactNode } from "react";

/* ── Thẻ kính nổi (Glassmorphism) ─────────────────────────── */
function GlassCard({
  className = "",
  icon,
  title,
  caption,
}: {
  className?: string;
  icon: ReactNode;
  title: string;
  caption: string;
}) {
  return (
    <div
      className={`absolute z-20 flex items-center gap-3 rounded-2xl border border-white/70 bg-white/60 px-4 py-3 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.25)] backdrop-blur-xl ${className}`}
    >
      {icon}
      <div className="leading-tight">
        <p className="whitespace-nowrap font-heading text-sm font-bold text-ink">{title}</p>
        <p className="mt-0.5 whitespace-nowrap text-xs text-body">{caption}</p>
      </div>
    </div>
  );
}

/* ── Mockup web dashboard (placeholder) ───────────────────── */
function DashboardMock() {
  const rows = [
    { time: "07:58", status: "Đúng giờ", ok: true, w: "w-24" },
    { time: "08:00", status: "Đúng giờ", ok: true, w: "w-20" },
    { time: "08:12", status: "Đi muộn", ok: false, w: "w-28" },
    { time: "08:02", status: "Đúng giờ", ok: true, w: "w-16" },
  ];

  return (
    <div className="absolute bottom-12 right-0 top-6 flex w-[88%] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-float">
      {/* Thanh trên cùng */}
      <div className="flex items-center gap-1.5 border-b border-slate-100 bg-surface px-4 py-3">
        <span className="size-2.5 rounded-full bg-slate-300" />
        <span className="size-2.5 rounded-full bg-slate-300" />
        <span className="size-2.5 rounded-full bg-slate-300" />
        <span className="ml-3 h-5 w-40 rounded-md bg-slate-200/70" />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <div className="hidden w-14 shrink-0 flex-col items-center gap-3 border-r border-slate-100 py-4 sm:flex">
          <span className="size-7 rounded-lg bg-blue-600/90" />
          <span className="size-7 rounded-lg bg-slate-100" />
          <span className="size-7 rounded-lg bg-slate-100" />
          <span className="size-7 rounded-lg bg-slate-100" />
        </div>

        {/* Nội dung chính */}
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pl-[5.25rem] sm:pl-4">
          <div className="h-4 w-36 rounded bg-slate-200" />

          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: "Có mặt", value: "42", color: "text-success" },
              { label: "Đi muộn", value: "3", color: "text-warning" },
              { label: "Vắng", value: "1", color: "text-slate-500" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-100 bg-surface px-3 py-2.5">
                <p className="text-[11px] text-body">{s.label}</p>
                <p className={`font-heading text-xl font-extrabold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-1 flex-col justify-around rounded-xl border border-slate-100 px-3 py-1">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <span className="size-7 shrink-0 rounded-full bg-brand-mist" />
                <span className={`h-2.5 rounded bg-slate-200 ${r.w}`} />
                <span className="ml-auto text-xs tabular-nums text-body">{r.time}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    r.ok ? "bg-success/15 text-emerald-700" : "bg-warning/15 text-amber-700"
                  }`}
                >
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Mockup điện thoại Face ID (placeholder) ──────────────── */
function PhoneMock() {
  const corner = "absolute size-5 border-success";
  return (
    <div className="absolute bottom-0 left-0 z-10 aspect-[9/18.5] w-[9.5rem] overflow-hidden rounded-[2rem] border-[6px] border-ink bg-white shadow-float sm:w-[12.5rem]">
      {/* Tai thỏ */}
      <span className="absolute left-1/2 top-1.5 h-3 w-14 -translate-x-1/2 rounded-full bg-ink" />

      <div className="flex h-full flex-col px-3 pb-3 pt-7 sm:px-4">
        <p className="text-center font-heading text-[11px] font-bold text-ink sm:text-xs">Chấm công</p>
        <p className="mt-0.5 text-center text-[9px] text-body sm:text-[10px]">Đưa khuôn mặt vào khung</p>

        {/* Khung quét khuôn mặt */}
        <div className="relative mx-auto mt-3 aspect-square w-[82%] overflow-hidden rounded-2xl bg-brand-mist">
          <span className={`${corner} left-2 top-2 rounded-tl-lg border-l-2 border-t-2`} />
          <span className={`${corner} right-2 top-2 rounded-tr-lg border-r-2 border-t-2`} />
          <span className={`${corner} bottom-2 left-2 rounded-bl-lg border-b-2 border-l-2`} />
          <span className={`${corner} bottom-2 right-2 rounded-br-lg border-b-2 border-r-2`} />

          <svg viewBox="0 0 64 64" className="absolute inset-0 m-auto size-3/5 text-blue-600/70" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <circle cx="32" cy="24" r="11" />
            <path d="M10 56c2-12 11-18 22-18s20 6 22 18" />
          </svg>

          {/* Dải quét */}
          <div className="absolute inset-x-0 top-0 h-1/4 animate-scan border-b-2 border-success bg-gradient-to-b from-transparent to-success/25" />
        </div>

        <div className="mx-auto mt-3 flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[9px] font-semibold text-emerald-700 sm:text-[10px]">
          <span className="size-1.5 rounded-full bg-success" />
          Khuôn mặt hợp lệ
        </div>

        <div className="mt-auto rounded-xl bg-blue-600 py-2 text-center text-[10px] font-semibold text-white sm:text-xs">
          Chấm công vào ca
        </div>
      </div>
    </div>
  );
}

/* ── Tổ hợp hiển thị ở cột phải Hero ──────────────────────── */
export default function HeroVisual() {
  return (
    <div
      role="img"
      aria-label="Minh hoạ Humora: chấm công Face ID trên điện thoại và bảng điều khiển quản lý trên web"
      className="relative mx-auto h-[26rem] w-full max-w-[34rem] sm:h-[34rem] lg:h-[36rem]"
    >
      <div aria-hidden="true" className="absolute inset-8 rounded-full bg-blue-600/15 blur-3xl" />

      <DashboardMock />
      <PhoneMock />

      <GlassCard
        className="left-[6%] top-0 animate-float-a sm:left-[12%]"
        icon={
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-success/15 text-emerald-700">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </span>
        }
        title="Đã chấm công 08:02 ✓"
        caption="Xác thực Face ID"
      />

      <GlassCard
        className="bottom-2 right-2 animate-float-b sm:right-0"
        icon={
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-600/15 font-heading text-base font-extrabold text-blue-600">
            ₫
          </span>
        }
        title="Lương tháng 10 đã chốt"
        caption="Tự động từ dữ liệu chấm công"
      />
    </div>
  );
}