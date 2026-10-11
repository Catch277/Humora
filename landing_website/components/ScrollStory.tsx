"use client";
import { useEffect, useState } from "react";
import { Playfair_Display } from "next/font/google";

const serif = Playfair_Display({
  subsets: ["latin", "vietnamese"],
  weight: ["700", "900"],
});

const SECTIONS = [
  { bg: "#cfe3ff", ink: "#e8381c", big: "CHẤM CÔNG", size: 14, tile: "#e8381c", tag: "Check-in", sub: "Một chạm, bằng khuôn mặt." },
  { bg: "#ff5a1f", ink: "#fff4e6", big: "ĐÚNG NƠI", size: 14, tile: "#ff5a1f", tag: "GPS + WiFi", sub: "Tự xác thực đúng chi nhánh." },
  { bg: "#e8456b", ink: "#ffe9ef", big: "TÍNH LƯƠNG", size: 12, tile: "#e8456b", tag: "Phiếu lương", sub: "Tính tự động theo giờ làm." },
  { bg: "#0f1226", ink: "#ffd9a8", big: "HR & CHẤM CÔNG", size: 8, tile: "#0f1226", tag: "HUFLIT", sub: "Đồ án môn học · Nhóm 5 thành viên" },
];

export default function ScrollStory() {
  const [p, setP] = useState(0);

  useEffect(() => {
    const onScroll = () => setP(window.scrollY / window.innerHeight);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const active = Math.min(SECTIONS.length - 1, Math.max(0, Math.round(p)));
  const s = SECTIONS[active];

  return (
    <div className={serif.className}>
      {SECTIONS.map((sec, i) => (
        <section
          key={i}
          className="relative flex h-screen flex-col items-center justify-center overflow-hidden"
          style={{ background: sec.bg, color: sec.ink }}
        >
          <h2
            className="whitespace-nowrap font-black leading-none"
            style={{
              fontSize: `${sec.size}vw`,
              transform: `translateX(${(i - p) * 25}vw)`,
            }}
          >
            {sec.big}
          </h2>
          <p
            className="mt-6 px-6 text-center text-lg font-bold md:text-2xl"
            style={{ opacity: 1 - Math.min(1, Math.abs(i - p) * 1.5) }}
          >
            {sec.sub}
          </p>
        </section>
      ))}

      {/* Điện thoại lơ lửng ở giữa, đè lên chữ */}
      <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center">
        <div
          className="aspect-[9/19] w-[50vw] max-w-[240px] overflow-hidden rounded-[2rem] border-[6px] border-black shadow-2xl"
          style={{
            transform: `perspective(900px) translateY(${Math.sin(p * 3) * 14}px) rotate(${Math.sin(p * Math.PI) * 14}deg) rotateY(${Math.sin(p * 2) * 25}deg)`,
          }}
        >
          <div
            className="flex h-full flex-col items-center justify-center gap-2 text-white transition-colors duration-500"
            style={{ background: s.tile }}
          >
            <div className="h-16 w-16 rounded-full bg-white/25" />
            <span className="text-xl font-bold">{s.tag}</span>
          </div>
        </div>
      </div>
    </div>
  );
}