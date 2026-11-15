import type { Payslip } from "@/lib/domain/entities/Payslip";
import type { PayslipItem } from "@/lib/domain/entities/PayslipItem";
import type { PayslipWorkLine } from "@/lib/domain/entities/PayslipWorkLine";

/**
 * One payslip with the rows that explain it (SCRUM-90): the ca it paid and the items that moved the total
 * away from "hours × rate".
 *
 * The three reads are separate queries because the child tables carry their own RLS policy
 * (`payslip_work_lines_select` / `payslip_items_select`: visible exactly when their payslip is), so a
 * `DRAFT` is invisible to the employee while the owner sees the whole picture.
 */
export interface PayslipDetail {
  payslip: Payslip;
  work_lines: PayslipWorkLine[];
  items: PayslipItem[];
}
