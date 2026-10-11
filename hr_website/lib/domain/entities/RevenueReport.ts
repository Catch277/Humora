export type RevenueReportPeriod =
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year";

export interface RevenueReportQuery {
  branchId?: string;
  startAt: Date;
  endAt: Date;
  bucket: "day" | "month";
}

export interface RevenueReportPoint {
  bucket_start: string;
  total_open_amount: number;
  total_close_amount: number;
  total_revenue_amount: number;
  record_count: number;
}

export interface RevenueReportSummary {
  total_open_amount: number;
  total_close_amount: number;
  total_revenue_amount: number;
  record_count: number;
}

export interface RevenueReportResult {
  period: RevenueReportPeriod;
  date: string;
  range: {
    start_at: string;
    end_at: string;
  };
  summary: RevenueReportSummary;
  comparison: {
    previous_total_revenue_amount: number;
    difference: number;
    percentage_change: number | null;
  };
  series: RevenueReportPoint[];
}
