import Link from "next/link";
import Accordion, { type FaqItem } from "./faq/Accordion";

const FAQS: FaqItem[] = [
  {
    question: "Dữ liệu khuôn mặt có an toàn không?",
    answer:
      "Dữ liệu khuôn mặt chỉ dùng để xác thực chấm công, được bảo vệ và phân quyền chặt chẽ.",
  },
  {
    question: "Nhân viên cần thiết bị gì?",
    answer: "Chỉ cần điện thoại có camera.",
  },
  {
    question: "Có chuyển được từ Excel sang không?",
    answer:
      "Có. Bạn nhập danh sách nhân viên và ca làm, đội ngũ của chúng tôi hỗ trợ thiết lập ban đầu.",
  },
  {
    question: "Nhân viên đổi ca, xin nghỉ thì sao?",
    answer: "Nhân viên gửi đơn ngay trên app, quản lý duyệt một chạm.",
  },
  {
    question: "Dùng thử có mất phí không?",
    answer: "Không. Bạn không cần nhập thẻ tín dụng để dùng thử.",
  },
];

export default function Faq() {
  return (
    <section id="faq" className="bg-white py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-[1fr_1.7fr] lg:gap-16">
        <div>
          <h2 className="font-heading text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">
            Câu hỏi thường gặp
          </h2>
          <p className="mt-4 leading-relaxed text-body">
            Chưa thấy câu trả lời bạn cần? Hãy nhắn cho chúng tôi, chúng tôi trả lời
            trong ngày làm việc.
          </p>
          <Link
            href="/contact"
            className="group mt-6 inline-flex items-center gap-2 rounded-lg font-semibold text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
          >
            Liên hệ với chúng tôi
            <svg viewBox="0 0 20 20" className="size-4 transition-transform duration-200 group-hover:translate-x-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 10h12M11 5l5 5-5 5" />
            </svg>
          </Link>
        </div>

        <Accordion items={FAQS} />
      </div>
    </section>
  );
}