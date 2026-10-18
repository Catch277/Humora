/* ─────────────────────────────────────────────────────────────
   Dữ liệu giá – lấy từ file "Nhom4_BaoGia.pdf" (Bảng quy mô và giá).
   Giá = số nhân viên × giá/người/tháng của BẬC quy mô tương ứng,
   tối thiểu MIN_FEE mỗi tháng. Trên 500 nhân viên: báo giá riêng.
   ───────────────────────────────────────────────────────────── */

export const MIN_FEE = 400_000;
export const MAX_STANDARD = 500;

export type PlanId = "basic" | "advanced" | "premium";

export const PLANS: { id: PlanId; name: string; tagline: string; web: boolean }[] = [
  {
    id: "basic",
    name: "Cơ bản",
    tagline: "Ứng dụng di động cho nhân viên và quản lý",
    web: false,
  },
  {
    id: "advanced",
    name: "Nâng cao",
    tagline: "Thêm web quản trị cho Ban Giám đốc và Phòng HR",
    web: true,
  },
  {
    id: "premium",
    name: "Cao cấp",
    // TODO: báo giá chưa nêu Cao cấp khác Nâng cao ở điểm nào – bổ sung tại đây khi có
    tagline: "Web quản trị và ứng dụng di động",
    web: true,
  },
];

/* Phạm vi hệ thống (mục I trong báo giá) */
export const APP_FEATURES = [
  "Xếp lịch và đăng ký ca",
  "Chấm công",
  "Xem lương",
  "Chat với trợ lý AI",
];
export const WEB_FEATURES = [
  "Quản lý nhân sự, ca làm và bảng công",
  "Cấu hình AI",
];

export type Tier = {
  id: string;
  name: string;
  min: number;
  max: number;
  prices: Record<PlanId, number>;
};

export const TIERS: Tier[] = [
  { id: "xs", name: "Rất nhỏ", min: 1, max: 10, prices: { basic: 20_000, advanced: 35_000, premium: 55_000 } },
  { id: "s", name: "Nhỏ", min: 11, max: 50, prices: { basic: 17_500, advanced: 32_000, premium: 50_000 } },
  { id: "m", name: "Vừa", min: 51, max: 200, prices: { basic: 15_000, advanced: 28_000, premium: 45_000 } },
  { id: "l", name: "Lớn", min: 201, max: 500, prices: { basic: 13_000, advanced: 25_000, premium: 40_000 } },
];

export function tierFor(count: number): Tier | null {
  return TIERS.find((t) => count >= t.min && count <= t.max) ?? null;
}

export function quote(count: number, plan: PlanId) {
  const tier = tierFor(count);
  if (!tier) return null;
  const perPerson = tier.prices[plan];
  const raw = perPerson * count;
  return { tier, perPerson, raw, total: Math.max(raw, MIN_FEE), minApplied: raw < MIN_FEE };
}

/* 1234567 → "1.234.567" (cố định, không phụ thuộc locale nên SSR/Client luôn khớp) */
export function formatVnd(n: number) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}