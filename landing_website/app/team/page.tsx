import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Đội ngũ – Humora",
  description:
    "Nhóm phát triển Humora: thiết kế, xây dựng web quản trị, ứng dụng di động và kiểm thử.",
};

type Member = {
  name: string;
  role: string;
  note: string;
  accent: string;
  initial: string;
};

const MEMBERS: Member[] = [
  {
    name: "Thiện",
    role: "Frontend Web",
    note: "Thiết kế và xây dựng website giới thiệu.",
    accent: "#2563eb",
    initial: "T",
  },
  {
    name: "Khoa",
    role: "Backend Web & Backend chung",
    note: "Firebase, Cloud Functions, tính lương tự động.",
    accent: "#0ea5e9",
    initial: "K",
  },
  {
    name: "Hoàng",
    role: "Backend App",
    note: "Logic Flutter: chấm công, GPS/WiFi, phiếu lương.",
    accent: "#10b981",
    initial: "H",
  },
  {
    name: "Hlan",
    role: "Frontend App",
    note: "Dựng toàn bộ giao diện ứng dụng Flutter.",
    accent: "#6366f1",
    initial: "H",
  },
  {
    name: "Tân",
    role: "Hỗ trợ tester",
    note: "Kiểm thử web và app, tổng hợp báo cáo đồ án.",
    accent: "#f59e0b",
    initial: "T",
  },
];

/* Lưới 6 cột, mỗi thẻ chiếm 2 cột: hàng đầu 3 thẻ, hàng cuối 2 thẻ canh giữa. */
const POSITION: Record<number, string> = {
  3: "lg:col-start-2",
  4: "lg:col-start-4",
};

const STATS = [
  { value: "5", label: "thành viên" },
  { value: "3", label: "mảng phụ trách" },
  { value: "2", label: "nền tảng" },
];

export default function TeamPage() {
  return (
    <>
      {/* ── Giới thiệu ── */}
      <section className="relative isolate overflow-hidden bg-surface">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_80%_0%,rgba(37,99,235,0.10),transparent_70%)]"
        />
        <div className="mx-auto max-w-6xl px-6 pb-14 pt-32 sm:pt-36">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-600/20 bg-white px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-blue-700">
            <span className="size-1.5 rounded-full bg-blue-600" aria-hidden="true" />
            Đội ngũ
          </span>

          <h1 className="mt-5 max-w-3xl font-heading text-4xl font-extrabold leading-[1.1] tracking-tight text-ink sm:text-5xl">
            Nhóm phát triển Humora
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-body">
            Năm thành viên cùng xây nền tảng quản lý nhân sự và ca làm việc: từ web quản trị cho chủ doanh nghiệp
            đến ứng dụng chấm công trên điện thoại của nhân viên.
          </p>

          <dl className="mt-10 grid max-w-2xl grid-cols-3 gap-4">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-soft sm:px-5">
                <dt className="sr-only">{s.label}</dt>
                <dd>
                  <span className="font-heading text-2xl font-extrabold tabular-nums text-ink sm:text-3xl">
                    {s.value}
                  </span>
                  <span className="mt-1 block text-xs leading-snug text-body sm:text-sm">{s.label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Thành viên ── */}
      <section aria-labelledby="team-list" className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 id="team-list" className="font-heading text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            Vai trò từng người
          </h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-body">
            Mỗi thành viên phụ trách một mảng riêng, phối hợp từ lúc dựng giao diện đến khi chạy thử toàn hệ thống.
          </p>

          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-6">
            {MEMBERS.map((m, i) => (
              <li key={m.name} className={`sm:col-span-1 lg:col-span-2 ${POSITION[i] ?? ""}`}>
                <article className="group flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-soft transition-all duration-300 ease-out hover:-translate-y-1 hover:border-blue-600/30 hover:shadow-[0_24px_48px_-20px_rgba(37,99,235,0.35)] motion-reduce:hover:translate-y-0">
                  <div className="flex items-center gap-3.5">
                    <span
                      aria-hidden="true"
                      className="grid size-12 shrink-0 place-items-center rounded-2xl font-heading text-lg font-extrabold text-white shadow-sm"
                      style={{ backgroundColor: m.accent }}
                    >
                      {m.initial}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-heading text-xl font-bold leading-tight text-ink">{m.name}</h3>
                      <p className="mt-1 text-sm font-semibold" style={{ color: m.accent }}>
                        {m.role}
                      </p>
                    </div>
                    <span className="ml-auto font-heading text-sm font-bold tabular-nums text-slate-300">
                      0{i + 1}
                    </span>
                  </div>

                  <p className="mt-5 flex-1 text-sm leading-relaxed text-body">{m.note}</p>

                  <span
                    aria-hidden="true"
                    className="mt-5 block h-1 w-10 rounded-full transition-all duration-300 group-hover:w-16"
                    style={{ backgroundColor: m.accent }}
                  />
                </article>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Ghi chú + CTA ── */}
      <section className="bg-surface py-14 sm:py-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-sm leading-relaxed text-body">
            Humora được xây dựng trong khuôn khổ đồ án môn học của 5 sinh viên năm 3 HUFLIT, Khoa Công nghệ Thông
            tin, ngành Công nghệ Phần mềm.
          </p>
          <Link
            href="/contact?intent=demo"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-[0_10px_24px_-8px_rgba(37,99,235,0.65)] transition duration-200 hover:-translate-y-0.5 hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Đặt lịch Demo 20 phút
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 10h12M11 5l5 5-5 5" />
            </svg>
          </Link>
        </div>
      </section>
    </>
  );
}
