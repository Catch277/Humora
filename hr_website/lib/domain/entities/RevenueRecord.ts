export interface RevenueRecord {
  id: string;
  branch_id: string;
  open_amount: number;
  created_at: string;
  created_by: string;
  close_amount: number | null;
  close_note: string | null;
  close_image_url: string | null;
  closed_by: string | null;
  closed_at: string | null;
  audit_log: unknown[];
}

export interface CreateRevenueRecordInput {
  branchId: string;
  openAmount: number;
  createdBy: string;
}

export interface UpdateCloseRevenueInput {
  closeAmount: number;
  closeNote: string | null;
  closeImageUrl: string | null;
  closedBy: string;
}

/**
 * Filters for the revenue list behind the Doanh thu screen (the report endpoint answers totals and
 * buckets; this answers the records themselves, so the screen can show what was declared and who
 * closed it).
 */
export interface RevenueRecordFilters {
  branchId?: string;
  /** Inclusive start instant (already converted from the Asia/Bangkok business day). */
  startAt?: Date;
  /** Exclusive end instant. */
  endAt?: Date;
  /** true = closed records only, false = still open, undefined = both. */
  isClosed?: boolean;
}
