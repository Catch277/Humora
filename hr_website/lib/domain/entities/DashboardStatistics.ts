/**
 * What the dashboard's four charts are made of (A5/SCRUM-98).
 *
 * Two layers live in this file on purpose:
 *
 * - `…Row` / `…Query` mirror the two database RPCs (`get_dashboard_operations`,
 *   `get_dashboard_workforce`) and are what the repository hands back — numbers already coerced, still
 *   snake_case because they come from SQL.
 * - `DashboardStatistics` is what `GET /api/dashboard/statistics` answers: aggregated in the use case,
 *   zero-filled so a quiet day still has a column, and carrying the ratios the screen prints next to
 *   each figure.
 */
export const DASHBOARD_PERIODS = ["day", "month", "year"] as const;

/**
 * The filter the screen offers. `day` is the anchor day, `month` its whole month and `year` its whole
 * year — deliberately narrower than `RevenueReportPeriod`, because a dashboard chart is read, not
 * queried (the report screen keeps week/quarter).
 */
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export interface DashboardRange {
  /** The instant range the API aggregated over (UTC), Asia/Bangkok boundaries. */
  start_at: string;
  end_at: string;
  /** The same range as business dates (`YYYY-MM-DD`, Asia/Bangkok), which is what the RPCs take. */
  start_date: string;
  end_date: string;
}

export interface OperationSeriesQuery {
  branchId?: string;
  startDate: string;
  endDate: string;
  bucket: "day" | "month";
}

/** One `get_dashboard_operations` row: a bucket × a branch. Every figure is summable. */
export interface OperationSeriesRow {
  bucket_start: string;
  branch_id: string | null;
  branch_name: string | null;
  revenue_amount: number;
  revenue_records: number;
  attendance_total: number;
  on_time: number;
  late: number;
  early_leave: number;
  absent: number;
  incomplete: number;
}

export interface WorkforceQuery {
  branchId?: string;
  startDate: string;
  endDate: string;
}

/**
 * One `get_dashboard_workforce` row. `working_employees` / `absent_employees` are DISTINCT counts over
 * the whole range, which is why they are not part of `OperationSeriesRow`: summing them per day would
 * count one employee once per worked day.
 */
export interface WorkforceRow {
  branch_id: string | null;
  branch_name: string | null;
  employee_total: number;
  employee_active: number;
  employee_resigned: number;
  scheduled_total: number;
  no_show_total: number;
  working_employees: number;
  absent_employees: number;
}

/**
 * One point of the revenue chart. `bucket` is `YYYY-MM-DD` for a daily bucket and `YYYY-MM` for a
 * monthly one — the business date in Asia/Bangkok, so the screen never has to re-derive a timezone.
 */
export interface DashboardSeriesPoint {
  bucket: string;
  total_revenue: number;
  record_count: number;
}

export interface DashboardRevenueBranchPoint {
  branch_id: string | null;
  branch_name: string;
  total_revenue: number;
  record_count: number;
}

export interface DashboardRevenueSummary {
  series: DashboardSeriesPoint[];
  total: number;
  record_count: number;
  previous_total: number;
  /** `null` when the previous period had no closed ca — "we cannot compare", never "no change". */
  percentage_change: number | null;
  by_branch: DashboardRevenueBranchPoint[];
}

/**
 * The chấm công pie. `absent` is the stored `ABSENT` status only; `no_show` is a planned ca that ended
 * with no attendance row at all. The chart renders them as one slice ("Vắng") because they mean the
 * same thing to a reader, while the API keeps them apart so the footnote can say which is which.
 */
export interface DashboardAttendanceSummary {
  recorded: number;
  on_time: number;
  late: number;
  early_leave: number;
  absent: number;
  incomplete: number;
  no_show: number;
  total: number;
  /** `recorded / total` as a percentage, `null` when the range holds nothing. */
  attendance_rate: number | null;
}

export interface DashboardWorkforceSummary {
  total: number;
  active: number;
  resigned: number;
  working: number;
  absent: number;
  /** `active / total` as a percentage, `null` when the organization has no account at all. */
  active_rate: number | null;
}

/** The figures every branch row and the totals row share. */
export interface DashboardAggregate {
  employee_total: number;
  employee_active: number;
  employee_resigned: number;
  scheduled_total: number;
  no_show_total: number;
  working_employees: number;
  absent_employees: number;
  attendance_total: number;
  on_time: number;
  late: number;
  early_leave: number;
  absent: number;
  incomplete: number;
  revenue_total: number;
  revenue_records: number;
  attendance_rate: number | null;
}

export interface DashboardBranchStatistics extends DashboardAggregate {
  /** `null` is the owner's "chưa gán chi nhánh" bucket — a branch row no manager ever receives. */
  branch_id: string | null;
  branch_name: string;
}

export interface DashboardStatistics {
  period: DashboardPeriod;
  /** The anchor day (`YYYY-MM-DD`, Asia/Bangkok) the filter is set to. */
  date: string;
  range: DashboardRange;
  generated_at: string;
  revenue: DashboardRevenueSummary;
  attendance: DashboardAttendanceSummary;
  workforce: DashboardWorkforceSummary;
  branches: DashboardBranchStatistics[];
  totals: DashboardAggregate;
}
