/**
 * Đối soát lương — "nguồn thu nhập đến từ đâu, và con số đang lưu còn đúng không" (SCRUM-99).
 *
 * Sinh ra bởi `public.payroll_reconcile(date)` (`supabase/sql/SCRUM-99_payroll_reconciliation.sql`), nên các
 * trường ở đây **mirror cột của RPC** giống `PayEstimate`: snake_case, số tiền là số nguyên VND.
 *
 * Mỗi dòng đặt cạnh nhau hai lượt tính của cùng một tháng:
 *
 *   stored_*    — những gì `payslips` + `payslip_items` đang ghi
 *   computed_*  — những gì `payroll_work_lines` + đơn giá hiệu lực nói, tức là thứ `generate_payslips`
 *                 sẽ ghi lại
 *
 * `delta` = `computed_net - stored_net`. Không có phép tính tiền nào ở TypeScript: cả hai vế do SQL tính,
 * và ở đây chỉ đọc/so sánh chúng.
 *
 * `flags` là `string[]` **có chủ ý**, không phải union đóng: một CSDL chạy script mới hơn có thể thêm cờ mà
 * màn hình cũ vẫn phải render được (bài học SCRUM-62). `PAYROLL_RECONCILIATION_FLAGS` là những mã mà app
 * *biết* — một mã lạ hiển thị nguyên văn thay vì làm trắng badge.
 */
export interface PayrollReconciliationRow {
  employee_id: string;
  full_name: string | null;
  branch_id: string | null;
  payslip_id: string | null;
  /** `DRAFT` / `PUBLISHED`, hoặc `null` khi tháng này chưa có phiếu nào. */
  status: string | null;
  stored_work_amount: number;
  computed_work_amount: number;
  stored_allowance: number;
  computed_allowance: number;
  manual_earning: number;
  manual_deduction: number;
  /** Có dấu: dương là khoản cộng, âm là khoản trừ (một `ADJUSTMENT` của SCRUM-93). */
  adjustment_amount: number;
  stored_net: number;
  computed_net: number;
  delta: number;
  shifts_counted: number;
  shifts_skipped: number;
  computed_counted: number;
  computed_skipped: number;
  regular_minutes: number;
  overtime_minutes: number;
  /** Số ca được tính tới giờ tan ca thay vì có giờ ra thật (SCRUM-94/75). */
  open_shifts: number;
  flags: string[];
}

/**
 * Những cờ `payroll_reconcile` đặt vào `flags`. Hai cờ đầu là trạng thái của phiếu; phần còn lại nói *vì sao*
 * dòng này đáng nhìn.
 */
export const PAYROLL_RECONCILIATION_FLAGS = [
  "DRAFT",
  "PUBLISHED",
  "MISSING_PAYSLIP",
  "WOULD_REMOVE",
  "STALE",
  "NO_ATTENDANCE",
  "NO_RATE",
  "OPEN_SHIFT",
  "MANUAL_ITEMS",
  "ADJUSTMENT",
] as const;

export type PayrollReconciliationFlag =
  (typeof PAYROLL_RECONCILIATION_FLAGS)[number];

/** Tổng hợp của một tháng, để dải KPI không phải tự cộng lại ở mỗi lần render. */
export interface PayrollReconciliationSummary {
  rows: number;
  /** Số dòng một lần đồng bộ thật sự sẽ ghi (`STALE` hoặc `MISSING_PAYSLIP`). */
  needs_sync: number;
  /** Tổng `delta` của những dòng đó — con số "đang lệch bao nhiêu tiền". */
  delta_total: number;
  missing_payslips: number;
  stale: number;
  missing_rates: number;
  open_shifts: number;
  adjustments: number;
}

export interface PayrollReconciliation {
  /** `YYYY-MM-01`, đúng giá trị đã đưa cho RPC. */
  period_start: string;
  rows: PayrollReconciliationRow[];
  summary: PayrollReconciliationSummary;
}

/** Một dòng của `public.payroll_sync(date, uuid, boolean)`. */
export interface PayrollSyncRow {
  employee_id: string;
  action: string;
  reason: string;
  before_net: number;
  /**
   * In a dry run this is the figure the row *would* carry (the recomputed net), so `delta` is a real expected
   * difference rather than zero; after a real run it is what the payslip now says. Both come from
   * `payroll_work_lines`, so the two modes cannot predict different numbers.
   */
  after_net: number;
  delta: number;
}

/** What a caller asks `payroll_sync` to do. `apply: false` is the default everywhere, on purpose. */
export interface PayrollSyncOptions {
  apply: boolean;
  employeeId?: string;
}

export interface PayrollSyncResult {
  period_start: string;
  /** `false` = chạy thử, không ghi gì. */
  applied: boolean;
  rows: PayrollSyncRow[];
  /** Số dòng đã (hoặc sẽ) được tạo lại. */
  changed: number;
  /** Tổng chênh lệch của những dòng đó. */
  delta_total: number;
}

export const PAYROLL_SYNC_ACTIONS = ["CREATE", "REFRESH", "SKIP"] as const;

export type PayrollSyncAction = (typeof PAYROLL_SYNC_ACTIONS)[number];

export function hasReconciliationFlag(
  row: PayrollReconciliationRow,
  flag: PayrollReconciliationFlag,
): boolean {
  return row.flags.includes(flag);
}

/**
 * Một lần đồng bộ có việc để làm với dòng này hay không.
 *
 * Ba trạng thái bị loại trừ có chủ ý, và mỗi trạng thái vì một lý do khác nhau: phiếu đã phát hành là tiền
 * đã trả (`PUBLISHED`), tháng không còn ca nào thì `generate_payslips` sẽ **xoá** phiếu nháp chứ không sửa
 * (`WOULD_REMOVE` — một lần đồng bộ không xoá dữ liệu tiền), và `IN_SYNC` thì không có gì để làm.
 */
export function needsPayrollSync(row: PayrollReconciliationRow): boolean {
  return (
    hasReconciliationFlag(row, "STALE") ||
    hasReconciliationFlag(row, "MISSING_PAYSLIP")
  );
}

function countWithFlag(
  rows: PayrollReconciliationRow[],
  flag: PayrollReconciliationFlag,
): number {
  return rows.filter((row) => hasReconciliationFlag(row, flag)).length;
}

/**
 * Tổng hợp một tháng từ những dòng đã có.
 *
 * Đây **không** phải chỗ tính tiền: mỗi `delta` đã do SQL tính, ở đây chỉ cộng chúng lại để dải KPI của màn
 * hình không phải tự cộng lại ở mỗi lần render (và để con số trên KPI và con số trên bảng không lệch nhau).
 * `delta_total` chỉ cộng những dòng một lần đồng bộ thật sự sẽ sửa — một phiếu đã phát hành lệch số không
 * phải việc mà nút "Đồng bộ" giải quyết được.
 */
export function summariseReconciliation(
  rows: PayrollReconciliationRow[],
): PayrollReconciliationSummary {
  const needsSync = rows.filter(needsPayrollSync);

  return {
    rows: rows.length,
    needs_sync: needsSync.length,
    delta_total: needsSync.reduce((sum, row) => sum + row.delta, 0),
    missing_payslips: countWithFlag(rows, "MISSING_PAYSLIP"),
    stale: countWithFlag(rows, "STALE"),
    missing_rates: countWithFlag(rows, "NO_RATE"),
    open_shifts: countWithFlag(rows, "OPEN_SHIFT"),
    adjustments: countWithFlag(rows, "ADJUSTMENT"),
  };
}

/** Số dòng một lần chạy đã (hoặc sẽ) tạo lại, và tổng chênh lệch của chúng. */
export function summariseSync(rows: PayrollSyncRow[]): {
  changed: number;
  delta_total: number;
} {
  const changed = rows.filter((row) => row.action !== "SKIP");

  return {
    changed: changed.length,
    delta_total: changed.reduce((sum, row) => sum + row.delta, 0),
  };
}
