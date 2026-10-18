import type { Metadata } from "next";
import { Suspense } from "react";
import ContactSection from "@/components/contact/ContactSection";

export const metadata: Metadata = {
  title: "Liên hệ – Humora",
  description:
    "Đặt lịch demo, dùng thử miễn phí hoặc nhận báo giá Humora cho doanh nghiệp của bạn.",
};

/* ContactSection đọc ?intent=&plan=&employees= bằng useSearchParams
   → bọc Suspense để trang vẫn prerender tĩnh được. */
function Fallback() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-20 pt-32">
      <h1 className="font-heading text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
        Liên hệ với Humora
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-body">
        Hỏi về tính năng, giá hoặc cách chuyển từ Excel sang Humora.
      </p>
    </section>
  );
}

export default function ContactPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <ContactSection />
    </Suspense>
  );
}