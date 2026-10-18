import type { ReactNode } from "react";

/* ── 3 minh hoạ nhỏ, mỗi thẻ một hình khác nhau ───────────── */

function ProxyVisual() {
  const row =
    "flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs";
  return (
    <div className="space-y-2">
      <div className={row}>
        <span className="grid size-6 place-items-center rounded-full bg-brand-mist font-semibold text-blue-600">L</span>
        <span className="font-medium text-ink">Lan</span>
        <span className="ml-auto font-semibold text-success">08:00 ✓</span>
      </div>
      <div className={row}>
        <span className="grid size-6 place-items-center rounded-full bg-brand-mist font-semibold text-blue-600">M</span>
        <span className="font-medium text-ink">Minh</span>
        <span className="ml-auto font-semibold text-success">08:00 ✓</span>
      </div>
      <p className="flex items-center gap-1.5 px-1 text-xs font-medium text-amber-700">
        <span className="size-1.5 rounded-full bg-warning" />
        Minh chưa có mặt tại cửa hàng
      </p>
    </div>
  );
}

function SheetVisual() {
  const rows = [
    ["", "A", "B", "C"],
    ["1", "Giờ công", "Đơn giá", "Lương"],
    ["2", "176", "35.000", "6.160.000"],
    ["3", "168", "35.000", "#VALUE!"],
  ];
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white text-[11px] tabular-nums">
      {rows.map((cells, r) => (
        <div key={r} className="grid grid-cols-[1.5rem_1fr_1fr_1.3fr] border-b border-slate-100 last:border-b-0">
          {cells.map((cell, c) => {
            const isError = cell === "#VALUE!";
            const isHead = r === 0 || c === 0;
            return (
              <span
                key={c}
                className={`truncate px-2 py-1.5 ${
                  isError
                    ? "bg-warning/20 font-bold text-amber-700"
                    : isHead
                      ? "bg-surface text-center text-slate-400"
                      : r === 1
                        ? "font-semibold text-ink"
                        : "text-body"
                } ${c > 0 ? "border-l border-slate-100" : ""}`}
              >
                {cell}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ChatVisual() {
  const bubble = "max-w-[85%] rounded-2xl px-3 py-1.5 text-xs leading-snug";
  return (
    <div className="space-y-2">
      <p className={`${bubble} rounded-bl-sm border border-slate-200 bg-white text-ink`}>
        Mai em đổi ca được không ạ?
      </p>
      <p className={`${bubble} ml-auto rounded-br-sm bg-brand-mist text-blue-700`}>
        Ca nào cơ? Chị quên rồi
      </p>
      <p className={`${bubble} rounded-bl-sm border border-slate-200 bg-white text-ink`}>
        Ai trực tối thứ 7 vậy mọi người?
      </p>
    </div>
  );
}

const PAIN_POINTS: { title: string; text: string; visual: ReactNode }[] = [
  {
    title: "Chấm công hộ, gian lận giờ giấc",
    text: "Nhân viên nhờ đồng nghiệp bấm hộ, đi muộn vẫn đủ công. Bạn trả lương cho những giờ không ai làm.",
    visual: <ProxyVisual />,
  },
  {
    title: "Tính lương Excel, sai một ô sai cả bảng",
    text: "Cuối tháng ngồi đối chiếu bảng chấm công, ca tăng ca, nghỉ phép. Một công thức lệch là cả đội phản ánh.",
    visual: <SheetVisual />,
  },
  {
    title: "Xếp ca qua Zalo, lộn xộn và chồng chéo",
    text: "Đổi ca, xin nghỉ, thiếu người đột xuất, tất cả chìm trong tin nhắn nhóm.",
    visual: <ChatVisual />,
  },
];

export default function PainPoints() {
  return (
    <section id="pain" className="bg-surface py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <h2 className="mx-auto max-w-3xl text-center font-heading text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">
          Quản lý nhân sự bằng tay đang âm thầm lấy đi tiền và thời gian của bạn
        </h2>

        <ul className="mt-14 grid gap-6 md:grid-cols-3">
          {PAIN_POINTS.map((item) => (
            <li
              key={item.title}
              className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-soft transition-all duration-300 ease-out hover:-translate-y-2 hover:border-warning/60 hover:shadow-[0_24px_48px_-16px_rgba(245,158,11,0.35)] motion-reduce:hover:translate-y-0"
            >
              <div aria-hidden="true" className="rounded-2xl bg-surface p-4">
                {item.visual}
              </div>
              <h3 className="mt-6 font-heading text-xl font-bold leading-snug text-ink">
                {item.title}
              </h3>
              <p className="mt-3 leading-relaxed text-body">{item.text}</p>
            </li>
          ))}
        </ul>

        <p className="mx-auto mt-14 max-w-2xl text-center font-heading text-xl font-bold leading-snug text-ink sm:text-2xl">
          Bạn mở doanh nghiệp để phát triển, không phải để làm kế toán và quản lý Zalo.
        </p>
      </div>
    </section>
  );
}