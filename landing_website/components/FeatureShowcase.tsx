"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Playfair_Display } from "next/font/google";

const serif = Playfair_Display({
  subsets: ["latin", "vietnamese"],
  weight: ["700", "900"],
});

const FEATURES = [
  {
    title: "CHẤM CÔNG", short: "Bằng khuôn mặt", color: "#e8381c", bg: "#cfe3ff",
    desc: "Nhân viên mở app, camera nhận diện khuôn mặt và ghi nhận giờ vào ca chỉ trong một chạm.",
    points: ["Chụp ảnh khuôn mặt khi check-in", "Lưu lịch sử chấm công lên đám mây", "Báo lỗi ngay khi chấm sai"],
  },
  {
    title: "GPS & WIFI", short: "Đúng chi nhánh", color: "#ff5a1f", bg: "#ffe3c9",
    desc: "Hệ thống kiểm tra vị trí và mạng WiFi để chắc chắn nhân viên đang ở đúng chi nhánh.",
    points: ["Đối chiếu tọa độ GPS", "Kiểm tra tên WiFi và mã BSSID", "Cảnh báo khi sai chi nhánh"],
  },
  {
    title: "HIỆU QUẢ", short: "Làm việc", color: "#2f8f5b", bg: "#d9f2e3",
    desc: "Theo dõi giờ làm, số lần đi muộn, về sớm và số ca nghỉ trong từng tháng.",
    points: ["Thống kê giờ làm", "Đếm đi muộn, về sớm, quên check-in", "Lọc theo chi nhánh và ngày"],
  },
  {
    title: "LƯƠNG", short: "Tính tự động", color: "#e8456b", bg: "#ffd9e2",
    desc: "Lương được tính tự động từ dữ liệu chấm công, nhân viên xem phiếu lương ngay trong app.",
    points: ["Tính theo giờ chấm công", "Phiếu lương rõ ràng", "Quỹ lương và tổng lương cho quản lý"],
  },
  {
    title: "CA LÀM", short: "Duyệt yêu cầu", color: "#7a4cff", bg: "#e6dcff",
    desc: "Quản lý ca làm việc, nhân viên gửi yêu cầu và quản lý duyệt hoặc từ chối nhanh chóng.",
    points: ["Phân ca theo chi nhánh", "Yêu cầu ca phát sinh chờ duyệt", "Thông báo kết quả duyệt"],
  },
  {
    title: "TÁC VỤ", short: "Và tin nhắn", color: "#0f6fb3", bg: "#d4eaf9",
    desc: "Giao việc và trao đổi nhanh giữa quản lý và nhân viên ngay trong ứng dụng.",
    points: ["Danh sách công việc được giao", "Trò chuyện nội bộ", "Hồ sơ cá nhân và giấy tờ đính kèm"],
  },
];

export default function FeatureShowcase() {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const startX = useRef(0);
  const dragDx = useRef(0);
  const lastWheel = useRef(0);

  const go = useCallback((dir: number) => {
    setActive((a) => Math.min(FEATURES.length - 1, Math.max(0, a + dir)));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (!open && e.key === "ArrowRight") go(1);
      if (!open && e.key === "ArrowLeft") go(-1);
      if (!open && e.key === "Enter") setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const f = FEATURES[active];
  const rise = (i: number) => ({
    opacity: open ? 1 : 0,
    transform: open ? "translateY(0)" : "translateY(48px)",
    transition: `opacity 700ms ${450 + i * 130}ms, transform 700ms ${450 + i * 130}ms`,
  });

  return (
    <div className={serif.className}>
      {/* Màn hình đầu: dải thẻ chức năng */}
      <section
        className="relative flex h-screen select-none flex-col items-center justify-center overflow-hidden transition-colors duration-700"
        style={{ background: f.bg, color: f.color, touchAction: "pan-y" }}
        onPointerDown={(e) => { startX.current = e.clientX; dragDx.current = 0; }}
        onPointerUp={(e) => {
          dragDx.current = e.clientX - startX.current;
          if (dragDx.current < -40) go(1);
          if (dragDx.current > 40) go(-1);
        }}
        onWheel={(e) => {
          const now = Date.now();
          if (now - lastWheel.current < 500) return;
          const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
          if (Math.abs(d) > 20) { go(d > 0 ? 1 : -1); lastWheel.current = now; }
        }}
      >
        {/* Chữ lớn phía sau thẻ */}
        <h1 className="pointer-events-none absolute whitespace-nowrap text-[15vw] font-black leading-none transition-all duration-500">
          {f.title}
        </h1>

        {/* Dải thẻ */}
        <div className="relative flex h-[62vh] w-full items-center justify-center">
          {FEATURES.map((it, i) => {
            const d = i - active;
            const far = Math.abs(d) > 2;
            return (
              <button
                key={it.title}
                onClick={() => {
                  if (Math.abs(dragDx.current) > 10) return;
                  if (i === active) setOpen(true);
                  else setActive(i);
                }}
                className="absolute flex aspect-[9/16] w-[46vw] max-w-[230px] flex-col justify-between rounded-[2rem] border-[6px] border-black p-5 text-left text-white shadow-2xl transition-all duration-500 ease-out"
                style={{
                  background: it.color,
                  zIndex: 10 - Math.abs(d),
                  opacity: far ? 0 : 1,
                  pointerEvents: far ? "none" : "auto",
                  transform: `translateX(calc(${d} * min(30vw, 270px))) scale(${1 - Math.min(Math.abs(d), 2) * 0.14}) rotate(${d * 6}deg)`,
                }}
              >
                <span className="text-sm font-bold opacity-80">0{i + 1}</span>
                <span>
                  <span className="block text-2xl font-black leading-tight">{it.title}</span>
                  <span className="mt-1 block text-sm opacity-90">{it.short}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Điều khiển */}
        <div className="absolute bottom-8 flex flex-col items-center gap-3">
          <div className="flex items-center gap-4">
            <button onClick={() => go(-1)} className="h-10 w-10 rounded-full border-2 border-current text-lg" aria-label="Trước">←</button>
            <div className="flex gap-2">
              {FEATURES.map((_, i) => (
                <span key={i} className="h-2 rounded-full bg-current transition-all" style={{ width: i === active ? 24 : 8, opacity: i === active ? 1 : 0.35 }} />
              ))}
            </div>
            <button onClick={() => go(1)} className="h-10 w-10 rounded-full border-2 border-current text-lg" aria-label="Sau">→</button>
          </div>
          <p className="text-xs font-bold opacity-70">Kéo hoặc dùng ← → để lướt · Bấm thẻ ở giữa để xem</p>
        </div>
      </section>

      {/* Panel trượt từ dưới lên */}
      <div
        className="fixed inset-0 z-[60] overflow-y-auto"
        aria-hidden={!open}
        style={{
          background: f.color,
          color: "#fff4e6",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform 800ms cubic-bezier(.77,0,.18,1)",
        }}
      >
        <button onClick={() => setOpen(false)} className="fixed right-6 top-6 z-10 h-11 w-11 rounded-full border-2 border-current text-xl" aria-label="Đóng">✕</button>
        <div className="mx-auto max-w-3xl px-6 py-24">
          <p className="mb-4 text-sm font-bold opacity-80" style={rise(0)}>0{active + 1} / 0{FEATURES.length}</p>
          <h2 className="text-[13vw] font-black leading-none md:text-8xl" style={rise(1)}>{f.title}</h2>
          <p className="mt-8 text-xl md:text-2xl" style={rise(2)}>{f.desc}</p>
          <ul className="mt-10 space-y-4 text-lg md:text-xl">
            {f.points.map((p, i) => (
              <li key={p} className="border-t border-white/40 pt-4" style={rise(3 + i)}>{p}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}