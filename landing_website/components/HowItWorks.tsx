const STEPS = [
  {
    title: "Thiết lập",
    badge: "15 phút",
    text: "Thêm cửa hàng, nhân viên và vị trí chấm công.",
  },
  {
    title: "Xếp ca",
    badge: null,
    text: "Tạo lịch, nhân viên nhận ca ngay trên app.",
  },
  {
    title: "Tự động hoá",
    badge: null,
    text: "Chấm công, duyệt và tính lương chạy liền mạch.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="mx-auto max-w-3xl text-center font-heading text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">
          Bắt đầu chỉ với 3 bước
        </h2>

        <ol className="mt-16 grid gap-12 md:grid-cols-3 md:gap-8">
          {STEPS.map((step, i) => {
            const last = i === STEPS.length - 1;
            return (
              <li key={step.title} className="relative text-center">
                {/* Đường nối đứt nét tới bước kế tiếp (desktop) */}
                {!last && (
                  <span
                    aria-hidden="true"
                    className="absolute left-[calc(50%+2.5rem)] top-8 hidden w-[calc(100%+2rem-5rem)] border-t-2 border-dashed border-blue-600/30 md:block"
                  />
                )}

                <span
                  className={`relative mx-auto grid size-16 place-items-center rounded-2xl font-heading text-2xl font-extrabold text-white shadow-[0_12px_24px_-8px_rgba(37,99,235,0.6)] ${
                    last ? "bg-success shadow-[0_12px_24px_-8px_rgba(16,185,129,0.6)]" : "bg-blue-600"
                  }`}
                >
                  <span className="sr-only">Bước </span>
                  {i + 1}
                </span>

                <h3 className="mt-6 flex items-center justify-center gap-2 font-heading text-xl font-bold text-ink">
                  {step.title}
                  {step.badge && (
                    <span className="rounded-full bg-brand-mist px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                      {step.badge}
                    </span>
                  )}
                </h3>
                <p className="mx-auto mt-3 max-w-[16rem] leading-relaxed text-body">
                  {step.text}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}