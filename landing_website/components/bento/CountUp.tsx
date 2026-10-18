"use client";

import { useEffect, useRef, useState } from "react";

/* Đếm số từ 0 → `to` đúng 1 lần, khi phần tử cuộn vào khung nhìn.
   - Giảm chuyển động (prefers-reduced-motion): hiện luôn số cuối.
   - Screen reader đọc số cuối cùng, không đọc các số trung gian. */
export default function CountUp({
  to,
  duration = 1400,
  className,
}: {
  to: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;

    const run = () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setValue(to);
        return;
      }
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - start) / duration, 1);
        setValue(Math.round(to * (1 - Math.pow(1 - p, 3)))); // ease-out cubic
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          run();
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, duration]);

  return (
    <span ref={ref} className={`tabular-nums ${className ?? ""}`}>
      <span aria-hidden="true">{value.toLocaleString("vi-VN")}</span>
      <span className="sr-only">{to.toLocaleString("vi-VN")}</span>
    </span>
  );
}