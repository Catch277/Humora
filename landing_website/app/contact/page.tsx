"use client";
import { useState } from "react";
import { serif } from "@/lib/fonts";

export default function ContactPage() {
  const [sent, setSent] = useState(false);
  const field =
    "w-full rounded-2xl border-4 border-black bg-white px-4 py-3 text-base text-black outline-none focus:border-[#e8381c]";

  return (
    <div className={serif.className} style={{ background: "#cfe3ff", color: "#e8381c" }}>
      <section className="mx-auto max-w-3xl px-6 pb-24 pt-32">
        <h1 className="text-[16vw] font-black leading-none md:text-[9rem]">LIÊN HỆ</h1>
        <p className="mt-4 text-lg font-bold md:text-2xl">Muốn dùng thử hệ thống? Để lại lời nhắn cho nhóm.</p>

        {sent ? (
          <div className="mt-12 rounded-[2rem] border-[6px] border-black bg-[#e8381c] p-8 text-white">
            <h2 className="text-3xl font-black">Cảm ơn bạn!</h2>
            <p className="mt-2">Nhóm đã nhận được lời nhắn và sẽ phản hồi sớm.</p>
          </div>
        ) : (
          <div className="mt-12 space-y-4">
            <input className={field} placeholder="Họ và tên" />
            <input className={field} type="email" placeholder="Email" />
            <textarea className={field} rows={5} placeholder="Nội dung" />
            <button
              onClick={() => setSent(true)}
              className="rounded-full border-4 border-black bg-[#e8381c] px-8 py-3 text-lg font-black text-white transition-transform hover:scale-105"
            >
              Gửi lời nhắn
            </button>
          </div>
        )}
      </section>
    </div>
  );
}