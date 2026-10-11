import Header from "@/components/Header";
import ProfileProvider from "@/components/ProfileProvider";
import Sidebar from "@/components/Sidebar";
import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Humora | HR & Shift Intelligence",
  description: "Hệ thống quản lý nhân sự và vận hành Humora",
};

/**
 * Chạy trước lần vẽ đầu tiên: đọc lựa chọn giao diện đã lưu (Sáng / Tối / Theo hệ thống) và gắn lớp
 * `.dark` lên `<html>`, để tải lại trang ở chế độ tối không bị nháy sáng. Viết thẳng trong layout vì
 * mọi thứ được import sẽ chạy quá muộn.
 */
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("humora-theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (stored === "dark" || ((stored === "system" || !stored) && prefersDark)) {
      document.documentElement.classList.add("dark");
    }
  } catch (error) {
    /* Chế độ riêng tư hoặc storage bị chặn: dùng giao diện sáng. */
  }
})();
`;

/**
 * Shell: the navigation, the header and the scrolling page.
 *
 * Below `md` the page scrolls as a normal document (`min-h-dvh`), from `md` up it is the fixed-height frame
 * it always was (`h-dvh` plus an inner scroller). The reason is iOS Safari: it overlays the keyboard
 * without resizing the layout viewport, so a field near the bottom of a modal would stay hidden behind it
 * inside an inner scroller, while a document scroll lets the browser reveal it.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `suppressHydrationWarning`: lớp `.dark` do script trên gắn trước khi React hydrate.
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        className={`${beVietnamPro.variable} flex min-h-dvh overflow-x-hidden bg-app font-sans text-slate-900 antialiased selection:bg-blue-100 selection:text-blue-900 md:h-dvh md:overflow-hidden`}
      >
        <ProfileProvider>
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col md:overflow-hidden">
            <Header />
            <main className="min-h-0 flex-1 bg-app p-4 md:overflow-y-auto md:p-6">
              <div className="mx-auto w-full max-w-[1440px]">{children}</div>
            </main>
          </div>
        </ProfileProvider>
      </body>
    </html>
  );
}

