/**
 * Phiếu lương của một nhân viên trong một tháng (SCRUM-90).
 *
 * The lifecycle is deliberately short, because a payslip is the record of money that was paid:
 *
 *   DRAFT ──publish──▶ PUBLISHED ──void──▶ VOID
 *     └──────────────void────────────────────▲
 *
 * A `DRAFT` is re-generated freely (the generator replaces its lines). Once `PUBLISHED` neither the
 * totals nor the lines can change — `payslips_guard` / `payslip_children_guard` refuse it, also against
 * the SQL editor — so a mistake is "huỷ" + generate again, which leaves the audit trail intact.
 *
 * Values mirror `public.payslips`; every amount is integer VND and the CHECK keeps
 * `gross = work_amount + other_earnings` and `net = gross - deduction_amount`.
 */
export const PAYSLIP_STATUSES = ["DRAFT", "PUBLISHED", "VOID"] as const;

export type PayslipStatus = (typeof PAYSLIP_STATUSES)[number];

export interface Payslip {
  id: string;
  organization_id: string;
  employee_id: string;
  branch_id: string | null;
  period_start: string;
  period_end: string;
  status: PayslipStatus;
  regular_minutes: number;
  overtime_minutes: number;
  shifts_counted: number;
  shifts_skipped: number;
  work_amount: number;
  other_earnings: number;
  gross_amount: number;
  deduction_amount: number;
  net_amount: number;
  generated_at: string;
  published_at: string | null;
  published_by: string | null;
  acknowledged_at: string | null;
  dispute_note: string | null;
  disputed_at: string | null;
  dispute_resolved_at: string | null;
  void_reason: string | null;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
}

/** The month the screen is looking at (`YYYY-MM`, expanded to `YYYY-MM-01` by the route parser). */
export interface PayslipFilters {
  period: string;
  employeeId?: string;
}

/** What `publish_payslips` answers: a published payslip whose employee still has an open khiếu nại is held. */
export interface PublishPayslipsResult {
  published: number;
  held_for_complaints: number;
}

/** `void_payslip` demands a reason the reviewer can read later (`5..300` characters). */
export const PAYSLIP_VOID_REASON_LENGTH = { min: 5, max: 300 } as const;

/** `dispute_payslip` (the employee's khiếu nại) demands `5..500` characters. */
export const PAYSLIP_DISPUTE_NOTE_LENGTH = { min: 5, max: 500 } as const;

export function isPayslipStatus(value: unknown): value is PayslipStatus {
  return (
    typeof value === "string" &&
    (PAYSLIP_STATUSES as readonly string[]).includes(value)
  );
}
