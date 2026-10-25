/**
 * Đơn giá giờ của một nhân viên (SCRUM-90): the rate that person is paid from `effective_from` on.
 *
 * A raise is a NEW row, never an edit, which is why the table has `unique (employee_id, effective_from)`
 * and why a payslip already published keeps the number it was built from — the lines store a snapshot of
 * `hourly_rate`, `multiplier` and `amount`.
 *
 * Money is integer VND (a `bigint` column, no decimals in a đồng) and `overtime_multiplier` is the
 * `numeric(3,2)` factor applied to the hours of a ca the catalogue flags `is_overtime`. The bounds below
 * mirror the CHECK constraints of `supabase/sql/SCRUM-90_payroll.sql`, so the API can refuse a body the
 * database would reject instead of answering `500`.
 */
export interface PayProfile {
  id: string;
  organization_id: string;
  employee_id: string;
  hourly_rate: number;
  overtime_multiplier: number;
  fixed_allowance: number;
  effective_from: string;
  note: string | null;
  created_at: string;
}

export const PAY_PROFILE_LIMITS = {
  hourlyRate: { min: 0, max: 10_000_000 },
  overtimeMultiplier: { min: 1, max: 5 },
  fixedAllowance: { min: 0, max: 1_000_000_000 },
  noteLength: 500,
} as const;

/**
 * What the owner submits. `effectiveFrom` is a calendar date (`YYYY-MM-DD`): the rate applies to the ca
 * worked from that day on, and the generator picks the latest row whose `effective_from` is inside the
 * month (`generate_payslips`).
 */
export interface SetPayProfileInput {
  employeeId: string;
  hourlyRate: number;
  effectiveFrom: string;
  overtimeMultiplier: number;
  fixedAllowance: number;
  note: string | null;
}
