import { serif } from "@/lib/fonts";

const FEATURES = [
  { title: "Chấm công", color: "#e8381c", desc: "Chụp ảnh khuôn mặt khi check-in, lưu lịch sử chấm công và báo lỗi ngay khi chấm sai." },
  { title: "GPS & WiFi", color: "#ff5a1f", desc: "Đối chiếu vị trí GPS, tên WiFi và mã BSSID để xác nhận nhân viên đang ở đúng chi nhánh." },
  { title: "Hiệu quả làm việc", color: "#2f8f5b", desc: "Thống kê giờ làm, số lần đi muộn, về sớm, quên check-in và số ca nghỉ." },
  { title: "Tính lương", color: "#e8456b", desc: "Lương tự động tính từ dữ liệu chấm công, nhân viên xem phiếu lương ngay trong app." },
  { title: "Quản lý ca", color: "#7a4cff", desc: "Phân ca theo chi nhánh, duyệt hoặc từ chối yêu cầu ca phát sinh." },
  { title: "Tác vụ & tin nhắn", color: "#0f6fb3", desc: "Giao việc, trò chuyện nội bộ, quản lý hồ sơ cá nhân và giấy tờ đính kèm." },
];

export default function FeaturesPage() {
  return (
    <div className={serif.className} style={{ background: "#ffe3c9", color: "#e8381c" }}>
      <section className="mx-auto max-w-6xl px-6 pb-24 pt-32">
        <h1 className="text-[14vw] font-black leading-none md:text-[8rem]">TÍNH NĂNG</h1>
        <p className="mt-4 max-w-xl text-lg font-bold md:text-2xl">
          Mọi thứ về chấm công và quản lý nhân sự, gói gọn trong một ứng dụng.
        </p>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <article
              key={f.title}
              className="flex min-h-[280px] flex-col justify-between rounded-[2rem] border-[6px] border-black p-6 text-white shadow-xl transition-transform hover:rotate-2 hover:scale-[1.03]"
              style={{ background: f.color }}
            >
              <span className="text-sm font-bold opacity-80">0{i + 1}</span>
              <div>
                <h2 className="text-3xl font-black leading-tight">{f.title}</h2>
                <p className="mt-3 text-sm opacity-90">{f.desc}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}