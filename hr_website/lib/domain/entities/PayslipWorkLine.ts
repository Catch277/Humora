/**
 * Một ca được trả lương trong phiếu lương (SCRUM-90), the evidence an employee can check against their
 * own memory: which day, which ca, how many minutes were paid, at which rate and how much that came to.
 *
 * The numbers are snapshots taken when the draft was generated — a later raise or a corrected timesheet
 * changes the NEXT generation, never a line that has already been paid. The database only stores the ca
 * that were actually counted (`minutes > 0`); the ca it skipped are summarised by
 * `Payslip.shifts_skipped`, because "why was this one skipped" is answered by the timesheet, not by money.
 */
export interface PayslipWorkLine {
  id: string;
  payslip_id: string;
  attendance_id: string | null;
  work_date: string;
  shift_name: string | null;
  minutes: number;
  is_overtime: boolean;
  hourly_rate: number;
  multiplier: number;
  amount: number;
}
