"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";

const TABS = [
  {
    id: "fnb",
    label: "F&B",
    question: "Ca sáng, ca tối, nhân viên part-time đổi ca liên tục?",
    answer: "Humora giữ lịch luôn gọn.",
    points: [
      "Nhân viên part-time tự đăng ký ca trống",
      "Đổi ca có duyệt, không còn nhắn tin chéo",
      "Lương tính theo đúng giờ làm thực tế",
    ],
  },
  {
    id: "retail",
    label: "Bán lẻ",
    question: "Nhiều chi nhánh, một màn hình quản lý.",
    answer: "Biết ai đang ở cửa hàng nào.",
    points: [
      "Xem ai đang có mặt tại từng cửa hàng",
      "Chỉ chấm công được trong phạm vi cửa hàng",
      "Duyệt ca từ xa ngay trên điện thoại",
    ],
  },
  {
    id: "service",
    label: "Dịch vụ",
    question: "Nhân sự di chuyển nhiều?",
    answer: "Chấm công theo vị trí, không cần máy cố định.",
    points: [
      "Chấm công bằng điện thoại, ở đúng nơi làm việc",
      "Face ID xác nhận đúng người",
      "Lịch ca cập nhật ngay trên app của nhân viên",
    ],
  },
  {
    id: "hr",
    label: "HR Manager",
    question: "Dữ liệu sạch, báo cáo sẵn sàng.",
    answer: "Hết cảnh đuổi theo bảng công cuối tháng.",
    points: [
      "Dữ liệu chấm công đối chiếu được từng ca",
      "Bảng lương tự động từ dữ liệu thật",
      "Duyệt đơn nghỉ một chạm, có thông báo",
    ],
  },
];

export default function AudienceTabs() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (index: number) => {
    const next = (index + TABS.length) % TABS.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key === "ArrowRight") select(index + 1);
    else if (e.key === "ArrowLeft") select(index - 1);
    else if (e.key === "Home") select(0);
    else if (e.key === "End") select(TABS.length - 1);
    else return;
    e.preventDefault();
  };

  const tab = TABS[active];

  return (
    <div className="mt-12">
      {/* Thanh tab */}
      <div className="-mx-6 overflow-x-auto px-6 pb-2 sm:mx-0 sm:overflow-visible sm:px-0">
        <div
          role="tablist"
          aria-label="Ngành nghề sử dụng Humora"
          className="mx-auto flex w-max gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-soft"
        >
          {TABS.map((t, i) => {
            const selected = i === active;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={selected}
                aria-controls={`panel-${t.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(i)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={`whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                  selected
                    ? "bg-blue-600 text-white shadow-[0_6px_16px_-6px_rgba(37,99,235,0.6)]"
                    : "text-body hover:bg-slate-100 hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Nội dung tab – key đổi theo tab để chạy lại hiệu ứng xuất hiện */}
      <div
        key={tab.id}
        role="tabpanel"
        id={`panel-${tab.id}`}
        aria-labelledby={`tab-${tab.id}`}
        tabIndex={0}
        className="mt-8 animate-rise rounded-3xl border border-slate-200 bg-white p-6 shadow-soft [animation-duration:350ms] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 sm:p-10"
      >
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
          <div>
            <h3 className="font-heading text-2xl font-bold leading-snug tracking-tight text-ink sm:text-3xl">
              {tab.question}
            </h3>
            <p className="mt-3 text-lg leading-relaxed text-body">{tab.answer}</p>
            <Link
              href="/contact?intent=demo"
              className="group mt-7 inline-flex items-center gap-2 rounded-lg text-base font-semibold text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
            >
              Xem Humora hoạt động thế nào
              <svg viewBox="0 0 20 20" className="size-4 transition-transform duration-200 group-hover:translate-x-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 10h12M11 5l5 5-5 5" />
              </svg>
            </Link>
          </div>

          <ul className="space-y-3 rounded-2xl bg-brand-mist/70 p-5 sm:p-6">
            {tab.points.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-success/15 text-emerald-700">
                  <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 10.5l3.2 3.2L15 7" />
                  </svg>
                </span>
                <span className="font-medium text-ink">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}