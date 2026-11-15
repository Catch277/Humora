/**
 * "Thu nhập tạm tính" of the caller for one month (SCRUM-90, `my_pay_estimate`).
 *
 * The database computes it with exactly the function the payslip generator uses
 * (`payroll_work_lines`), so the number an employee sees mid-month is the rule that will pay them —
 * not a second implementation that could disagree. It stops at `gross_estimate`: deductions are the
 * owner's decision and only exist once a payslip does.
 *
 * `has_pay_profile = false` means nobody has set a rate for this account yet; the screen says so instead
 * of showing `0 ₫` as if no work had been recorded.
 */
export interface PayEstimate {
  period_start: string;
  period_end: string;
  has_pay_profile: boolean;
  regular_minutes: number;
  overtime_minutes: number;
  shifts_counted: number;
  shifts_skipped: number;
  work_amount: number;
  allowance_amount: number;
  gross_estimate: number;
}
