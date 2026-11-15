/**
 * Everything on a payslip that is not "hours × rate" (SCRUM-90): phụ cấp, thưởng, điều chỉnh (EARNING) and
 * khấu trừ (DEDUCTION).
 *
 * `source` separates the two lives of an item: `AUTO` is the fixed allowance the generator writes and
 * rewrites on every re-generation, `MANUAL` is what an owner typed — and only a `MANUAL` item can be
 * removed (`remove_payslip_item`), so re-generating never loses a hand-entered number and a removal can
 * never delete the allowance the rule itself put there.
 *
 * BHXH/BHYT/BHTN and thuế TNCN are deliberately NOT computed here (they change with the law); they are
 * entered as `MANUAL` deductions.
 */
export const PAYSLIP_ITEM_KINDS = ["EARNING", "DEDUCTION"] as const;

export type PayslipItemKind = (typeof PAYSLIP_ITEM_KINDS)[number];

export const PAYSLIP_ITEM_SOURCES = ["AUTO", "MANUAL"] as const;

export type PayslipItemSource = (typeof PAYSLIP_ITEM_SOURCES)[number];

export interface PayslipItem {
  id: string;
  payslip_id: string;
  kind: PayslipItemKind;
  code: string;
  label: string;
  amount: number;
  source: PayslipItemSource;
  created_at: string;
}

/** The CHECK constraints of `public.payslip_items`: an amount is always positive and at most 1 tỷ. */
export const PAYSLIP_ITEM_AMOUNT_MAX = 1_000_000_000;
export const PAYSLIP_ITEM_LABEL_LENGTH = { min: 1, max: 80 } as const;
export const PAYSLIP_ITEM_CODE_PATTERN = /^[A-Z0-9_]{2,30}$/;

/**
 * The codes the dialog offers. They are only a vocabulary for the picker — the database stores whatever
 * code it is given (`^[A-Z0-9_]{2,30}$`), so a new kind of allowance needs no SQL script, and an unknown
 * code from an older row still renders its own `label`.
 */
export const PAYSLIP_ITEM_CODE_PRESETS = [
  "BONUS",
  "MEAL",
  "RESPONSIBILITY",
  "ADJUSTMENT",
  "BHXH",
  "BHYT",
  "BHTN",
  "PIT",
  "ADVANCE",
  "OTHER",
] as const;

export interface AddPayslipItemInput {
  kind: PayslipItemKind;
  code: string;
  label: string;
  amount: number;
}

export function isPayslipItemKind(value: unknown): value is PayslipItemKind {
  return (
    typeof value === "string" &&
    (PAYSLIP_ITEM_KINDS as readonly string[]).includes(value)
  );
}
