/* ─────────────────────────────────────────────────────────────
   Dữ liệu giá – lấy từ file "Nhom4_BaoGia.pdf" (Bảng quy mô và giá).
   Giá = số nhân viên × đơn giá của BẬC quy mô và gói tương ứng,
   tối thiểu MIN_FEE cho mỗi kỳ thanh toán. Trên 500 nhân viên: báo giá riêng.
   ───────────────────────────────────────────────────────────── */

export const MIN_FEE = 400_000;
export const MAX_STANDARD = 500;

export type PlanId = "basic" | "advanced" | "premium";

export type Plan = {
  id: PlanId;
  name: string;
  short: string;
  tagline: string;
  months: number;
  unitLabel: string;
  periodSuffix: string;
  totalLabel: string;
};

/*
 * Ba gói chỉ khác nhau về thời hạn đăng ký, nên phạm vi chức năng là như nhau.
 * Danh sách chức năng vì vậy nằm ngoài `PLANS` và dùng chung cho cả ba thẻ giá.
 */
export const PLANS: Plan[] = [
  {
    id: "basic",
    name: "Gói 1 tháng",
    short: "1 tháng",
    tagline: "Ứng dụng di động và web quản trị, thanh toán theo tháng",
    months: 1,
    unitLabel: "₫ / người / tháng",
    periodSuffix: "/tháng",
    totalLabel: "Tổng 1 tháng",
  },
  {
    id: "advanced",
    name: "Gói 3 tháng",
    short: "3 tháng",
    tagline: "Ứng dụng di động và web quản trị, thanh toán mỗi 3 tháng",
    months: 3,
    unitLabel: "₫ / người / 3 tháng",
    periodSuffix: "/3 tháng",
    totalLabel: "Tổng 3 tháng",
  },
  {
    id: "premium",
    name: "Gói 1 năm",
    short: "1 năm",
    tagline: "Ứng dụng di động và web quản trị, thanh toán mỗi năm",
    months: 12,
    unitLabel: "₫ / người / năm",
    periodSuffix: "/năm",
    totalLabel: "Tổng 1 năm",
  },
];

/* Phạm vi hệ thống (mục I trong báo giá) – áp dụng cho cả ba gói */
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

export function planFor(id: PlanId): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

export function tierFor(count: number): Tier | null {
  return TIERS.find((t) => count >= t.min && count <= t.max) ?? null;
}

export function quote(count: number, planId: PlanId) {
  const tier = tierFor(count);
  if (!tier) return null;
  const plan = planFor(planId);
  const perPerson = tier.prices[planId];
  const raw = perPerson * count;
  const total = Math.max(raw, MIN_FEE);
  const monthlyTotal = Math.round(total / plan.months);
  const baseMonthlyTotal = Math.max(tier.prices.basic * count, MIN_FEE);
  const compareTotal = baseMonthlyTotal * plan.months;
  const savings = Math.max(0, compareTotal - total);
  const savingsPercent =
    baseMonthlyTotal > 0
      ? Math.max(0, Math.round(((baseMonthlyTotal - total / plan.months) / baseMonthlyTotal) * 100))
      : 0;
  return {
    plan,
    tier,
    perPerson,
    monthlyTotal,
    raw,
    total,
    minApplied: raw < MIN_FEE,
    savings,
    savingsPercent,
  };
}

/* 1234567 → "1.234.567" (cố định, không phụ thuộc locale nên SSR/Client luôn khớp) */
export function formatVnd(n: number) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}