import type { Metadata } from "next";
import { Suspense } from "react";
import PaymentFlow from "@/components/payment/PaymentFlow";

export const metadata: Metadata = {
  title: "Thanh toán – Humora",
  description:
    "Thanh toán gói Humora qua ví MoMo. Trang minh hoạ cho đồ án môn học, không phát sinh giao dịch thật.",
};

/* PaymentFlow đọc ?plan=&employees= bằng useSearchParams
   → bọc Suspense để trang vẫn prerender tĩnh được. */
function Fallback() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-24 pt-28 sm:pt-32">
      <h1 className="font-heading text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
        Thanh toán đơn hàng
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-body">
        Đang tải thông tin đơn hàng…
      </p>
    </section>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <PaymentFlow />
    </Suspense>
  );
}
