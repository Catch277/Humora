"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

const NAV_LINKS = [
  { label: "Tính năng", href: "/#features" },
  { label: "Giải pháp", href: "/#solution" },
  { label: "Bảng giá", href: "/#pricing" },
  { label: "Câu hỏi thường gặp", href: "/#faq" },
];

const SCROLL_THRESHOLD = 16;

/* Đọc vị trí cuộn như một "external store" → không cần setState trong useEffect */
function subscribe(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}
const getSnapshot = () => window.scrollY > SCROLL_THRESHOLD;
const getServerSnapshot = () => false;

export default function Navbar() {
  const scrolled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [open, setOpen] = useState(false);
  const solid = scrolled || open;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,box-shadow] duration-300 ${
        solid
          ? "border-slate-200/70 bg-white/85 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.12)] backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-white/70"
          : "border-transparent bg-transparent"
      }`}
    >
      <nav
        aria-label="Điều hướng chính"
        className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-6"
      >
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
          onClick={() => setOpen(false)}
        >
          <Image src="/logo.png" alt="" width={223} height={175} priority className="h-10 w-auto" />
          <span className="font-heading text-xl font-extrabold tracking-tight text-ink">
            Humora
          </span>
        </Link>

        {/* Link giữa (desktop) */}
        <ul className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="group relative whitespace-nowrap rounded text-sm font-medium text-body transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 h-0.5 w-full origin-left scale-x-0 rounded bg-blue-600 transition-transform duration-300 group-hover:scale-x-100" />
              </Link>
            </li>
          ))}
        </ul>

        {/* CTA (desktop) */}
        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/contact?intent=demo"
            className="rounded-xl border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 transition-colors hover:bg-brand-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Đặt lịch Demo
          </Link>
          <Link
            href="/contact?intent=trial"
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_6px_16px_-6px_rgba(37,99,235,0.6)] transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Dùng thử miễn phí
          </Link>
        </div>

        {/* Nút menu (mobile) */}
        <button
          type="button"
          className="grid size-10 place-items-center rounded-xl text-ink transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600 lg:hidden"
          aria-label={open ? "Đóng menu" : "Mở menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </nav>

      {/* Menu mobile */}
      {open && (
        <div id="mobile-menu" className="border-t border-slate-200/70 px-6 pb-6 pt-3 lg:hidden">
          <ul className="flex flex-col">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-2 py-3 text-base font-medium text-ink hover:bg-slate-50"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-3">
            <Link
              href="/contact?intent=demo"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-blue-600 px-4 py-3 text-center text-sm font-semibold text-blue-600"
            >
              Đặt lịch Demo
            </Link>
            <Link
              href="/contact?intent=trial"
              onClick={() => setOpen(false)}
              className="rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white"
            >
              Dùng thử miễn phí
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}