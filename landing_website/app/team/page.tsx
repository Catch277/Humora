import { serif } from "@/lib/fonts";

const MEMBERS = [
  { name: "Thiện", role: "Frontend Web", note: "Thiết kế và xây dựng website giới thiệu.", color: "#e8381c" },
  { name: "Khoa", role: "Backend Web & Backend chung", note: "Firebase, Cloud Functions, tính lương tự động.", color: "#ff5a1f" },
  { name: "Hoàng", role: "Backend App", note: "Logic Flutter: chấm công, GPS/WiFi, phiếu lương.", color: "#2f8f5b" },
  { name: "Hlan", role: "Frontend App", note: "Dựng toàn bộ giao diện ứng dụng Flutter.", color: "#7a4cff" },
  { name: "Tân", role: "Hỗ trợ tester", note: "Kiểm thử web và app, tổng hợp báo cáo đồ án.", color: "#e8456b" },
];

export default function TeamPage() {
  return (
    <div className={serif.className} style={{ background: "#fff1e3", color: "#e8381c" }}>
      <section className="mx-auto max-w-6xl px-6 pb-24 pt-32">
        <h1 className="text-[18vw] font-black leading-none md:text-[10rem]">NHÓM</h1>
        <p className="mt-4 max-w-xl text-lg font-bold md:text-2xl">
          5 sinh viên năm 3 HUFLIT, Khoa Công nghệ Thông tin, ngành Công nghệ Phần mềm.
        </p>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {MEMBERS.map((m, i) => (
            <article
              key={m.name}
              className="flex min-h-[260px] flex-col justify-between rounded-[2rem] border-[6px] border-black p-6 text-white shadow-xl transition-transform hover:-rotate-2 hover:scale-[1.03]"
              style={{ background: m.color }}
            >
              <span className="text-sm font-bold opacity-80">0{i + 1}</span>
              <div>
                <h2 className="text-4xl font-black">{m.name}</h2>
                <p className="mt-1 text-lg font-bold">{m.role}</p>
                <p className="mt-3 text-sm opacity-90">{m.note}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}