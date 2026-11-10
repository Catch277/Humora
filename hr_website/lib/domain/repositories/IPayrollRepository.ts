import type { AddPayslipItemInput } from "@/lib/domain/entities/PayslipItem";
import type { PayEstimate } from "@/lib/domain/entities/PayEstimate";
import type {
  PayProfile,
  SetPayProfileInput,
  UpdatePayProfileInput,
} from "@/lib/domain/entities/PayProfile";
import type { PayslipDetail } from "@/lib/domain/entities/PayslipDetail";
import type {
  Payslip,
  PayslipFilters,
  PublishPayslipsResult,
} from "@/lib/domain/entities/Payslip";

/**
 * The payroll module (SCRUM-90) in one interface, because the writes are all RPCs on the same aggregate:
 * a rate feeds a payslip, a payslip owns its lines and items, and the same `payroll_work_lines` function
 * produces both the draft and the employee's estimate.
 *
 * Two rules the implementation must keep, and a caller must not rely on being able to break:
 *
 * - **The database decides who may do what.** Every write function starts with `payroll_require_owner()`
 *   and the tables carry a SELECT policy only (`payroll_require_owner`, `payslips_select`,
 *   `payslip_work_lines_select`), so the caller's organization and role are read from the session inside
 *   SQL — never from a parameter here. That is why nothing in this interface takes an organization id.
 * - **Money is never computed in TypeScript.** `generate` produces the lines and totals in the database
 *   and `estimate` uses the same function, so the number on the screen and the number in a payslip cannot
 *   disagree.
 */
export interface IPayrollRepository {
  /** Every rate the caller may read: the whole organization's for the owner, their own row for anybody else. */
  findProfiles(): Promise<PayProfile[]>;
  /** Stores one rate (a new `effectiveFrom` = a new row) and answers its id. */
  setProfile(input: SetPayProfileInput): Promise<string>;
  /** Rewrites an existing rate in place (SCRUM-92) and answers its id; `404` when the row is gone. */
  updateProfile(input: UpdatePayProfileInput): Promise<string>;
  /**
   * Removes one rate (SCRUM-92). Published payslips keep their snapshotted amounts, so this only changes
   * what the generator will do next; the row is written to `payroll_audit_log` first.
   */
  deleteProfile(id: string): Promise<void>;

  /** The payslips of one month; RLS narrows the answer to the caller's own PUBLISHED rows. */
  findPayslips(filters: PayslipFilters): Promise<Payslip[]>;
  /** One payslip with its work lines and items; `null` when RLS hides it or it does not exist. */
  findPayslip(id: string): Promise<PayslipDetail | null>;

  /** Creates or rewrites the DRAFTs of a month and answers how many it touched. */
  generate(periodStart: string, employeeId?: string): Promise<number>;
  /** Publishes every finished-month DRAFT that carries no open khiếu nại. */
  publish(periodStart: string): Promise<PublishPayslipsResult>;

  /** Adds a MANUAL phụ cấp/thưởng/khấu trừ to a DRAFT and answers its id. */
  addItem(payslipId: string, item: AddPayslipItemInput): Promise<string>;
  /** Removes a MANUAL item of a DRAFT (an AUTO one — the fixed allowance — stays). */
  removeItem(itemId: string): Promise<void>;
  /** Withdraws a DRAFT or a PUBLISHED payslip; the reason is stored for the audit trail. */
  voidPayslip(payslipId: string, reason: string): Promise<void>;
  /** Marks the employee's khiếu nại as handled. */
  resolveDispute(payslipId: string): Promise<void>;

  /** The employee's own "đã xem, đúng số" acknowledgement. */
  acknowledge(payslipId: string): Promise<void>;
  /** The employee's own khiếu nại against a published payslip. */
  dispute(payslipId: string, note: string): Promise<void>;

  /** "Thu nhập tạm tính" of the caller for one month, computed by the payslip's own rule. */
  estimate(periodStart: string): Promise<PayEstimate>;
}
