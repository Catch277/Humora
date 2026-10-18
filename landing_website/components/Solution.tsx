const FLOW = ["Xếp ca", "Chấm công", "Duyệt", "Tính lương"];

const COMPARISON = [
  {
    before: "Chấm công giấy hoặc máy vân tay, bấm hộ vẫn được",
    afterTitle: "Face ID + GPS/WiFi",
    afterNote: "Đúng người, đúng chỗ",
  },
  {
    before: "Xếp ca trên Zalo, Excel",
    afterTitle: "Lịch ca trực quan",
    afterNote: "Nhân viên tự đăng ký ca trống",
  },
  {
    before: "Duyệt đơn xin nghỉ bằng tin nhắn",
    afterTitle: "Duyệt một chạm",
    afterNote: "Có thông báo cho nhân viên",
  },
  {
    before: "Tính lương thủ công cuối tháng",
    afterTitle: "Bảng lương tự động",
    afterNote: "Đối chiếu từng ca làm",
  },
];

function Arrow() {
  return (
    <svg viewBox="0 0 20 20" className="hidden size-4 text-slate-300 sm:block" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10h12M11 5l5 5-5 5" />
    </svg>
  );
}

export default function Solution() {
  return (
    <section id="solution" className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <h2 className="mx-auto max-w-3xl font-heading text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">
            Humora: một nền tảng, trọn vòng đời ca làm việc
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-body">
            Từ lúc xếp ca đến khi chốt lương, mọi bước nối liền nhau. Không còn
            phải chạy qua lại giữa giấy, Zalo và Excel.
          </p>
        </div>

        {/* Luồng: Xếp ca → Chấm công → Duyệt → Tính lương */}
        <ol className="mt-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-3">
          {FLOW.map((step, i) => {
            const last = i === FLOW.length - 1;
            return (
              <li key={step} className="flex items-center gap-3">
                <span
                  className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                    last
                      ? "border-success/30 bg-success/10 text-emerald-700"
                      : "border-blue-600/20 bg-brand-mist text-blue-700"
                  }`}
                >
                  {step}
                </span>
                {!last && <Arrow />}
              </li>
            );
          })}
        </ol>

        {/* Bảng so sánh */}
        <div className="mt-12 overflow-hidden rounded-3xl border border-slate-200 shadow-soft">
          <div className="hidden md:grid md:grid-cols-2">
            <p className="bg-slate-100 px-8 py-4 font-heading text-base font-bold text-slate-500">
              Trước đây
            </p>
            <p className="bg-blue-600 px-8 py-4 font-heading text-base font-bold text-white">
              Với Humora
            </p>
          </div>

          {COMPARISON.map((row) => (
            <div key={row.before} className="grid border-t border-slate-200 first:border-t-0 md:grid-cols-2 md:first:border-t">
              {/* Trước đây */}
              <div className="flex items-start gap-3 bg-surface px-6 py-5 md:px-8">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-slate-200 text-slate-500">
                  <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l8 8M14 6l-8 8" />
                  </svg>
                </span>
                <div>
                  <span className="mb-1 block text-xs font-semibold text-slate-400 md:hidden">Trước đây</span>
                  <p className="text-body">{row.before}</p>
                </div>
              </div>

              {/* Với Humora */}
              <div className="flex items-start gap-3 bg-brand-mist/60 px-6 py-5 md:border-l md:border-blue-600/10 md:px-8">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-success/15 text-emerald-700">
                  <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 10.5l3.2 3.2L15 7" />
                  </svg>
                </span>
                <div>
                  <span className="mb-1 block text-xs font-semibold text-blue-600 md:hidden">Với Humora</span>
                  <p className="font-semibold text-ink">{row.afterTitle}</p>
                  <p className="mt-0.5 text-sm text-body">{row.afterNote}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}