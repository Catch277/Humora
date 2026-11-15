import type { ContractPlan } from "@/lib/domain/entities/CustomerContract";

/**
 * Bảng giá của landing site, giữ ở đây **chỉ để gợi ý** trong dialog hợp đồng.
 *
 * Nguồn: `landing_website/components/pricing/data.ts` (`PLANS`, `TIERS`, `MIN_FEE`). Giá lưu trong
 * `customer_contracts.unit_price` là giá chân lý — bảng này chỉ điền sẵn con số theo bậc quy mô để người
 * nhập không phải mở lại báo giá, và `monthly_fee` do CSDL tính. Hai repo là hai ứng dụng riêng, nên khi
 * báo giá đổi thì sửa **cả hai**; một chỗ lệch chỉ làm gợi ý sai, không làm hỏng dữ liệu đã lưu.
 */
export const CONTRACT_MIN_FEE = 400_000;

/** Trên ngưỡng này báo giá theo yêu cầu, nên không có bậc nào để gợi ý. */
export const CONTRACT_MAX_STANDARD_HEADCOUNT = 500;

export type ContractTier = {
  id: string;
  min: number;
  max: number;
  prices: Record<ContractPlan, number>;
};

export const CONTRACT_TIERS: readonly ContractTier[] = [
  { id: "xs", min: 1, max: 10, prices: { BASIC: 20_000, ADVANCED: 35_000, PREMIUM: 55_000 } },
  { id: "s", min: 11, max: 50, prices: { BASIC: 17_500, ADVANCED: 32_000, PREMIUM: 50_000 } },
  { id: "m", min: 51, max: 200, prices: { BASIC: 15_000, ADVANCED: 28_000, PREMIUM: 45_000 } },
  { id: "l", min: 201, max: 500, prices: { BASIC: 13_000, ADVANCED: 25_000, PREMIUM: 40_000 } },
];

export function contractTierFor(headcount: number): ContractTier | null {
  return (
    CONTRACT_TIERS.find(
      (tier) => headcount >= tier.min && headcount <= tier.max,
    ) ?? null
  );
}

/** The per-person price of a plan at a headcount, or `null` when the quotation is bespoke (> 500). */
export function suggestUnitPrice(
  headcount: number,
  plan: ContractPlan,
): number | null {
  return contractTierFor(headcount)?.prices[plan] ?? null;
}

/**
 * What the stored `monthly_fee` will be, for the dialog's read-only hint. The dialog never sends this
 * number: `customer_contracts.monthly_fee` is a generated column, so the database is the only author.
 */
export function estimateMonthlyFee(
  headcount: number,
  plan: ContractPlan,
): number | null {
  const unit = suggestUnitPrice(headcount, plan);

  return unit === null
    ? null
    : Math.max(Math.round(unit * headcount), CONTRACT_MIN_FEE);
}
