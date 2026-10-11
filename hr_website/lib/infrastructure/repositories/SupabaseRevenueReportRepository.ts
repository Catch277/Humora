import type {
  RevenueReportPoint,
  RevenueReportQuery,
} from "@/lib/domain/entities/RevenueReport";
import type { IRevenueReportRepository } from "@/lib/domain/repositories/IRevenueReportRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

type RevenueReportRpcRow = {
  bucket_start: string;
  total_open_amount: number | string;
  total_close_amount: number | string;
  total_revenue_amount: number | string;
  record_count: number | string;
};

export class SupabaseRevenueReportRepository
  implements IRevenueReportRepository
{
  async getAggregatedReport(
    query: RevenueReportQuery,
  ): Promise<RevenueReportPoint[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_revenue_report", {
      p_branch_id: query.branchId ?? null,
      p_start_at: query.startAt.toISOString(),
      p_end_at: query.endAt.toISOString(),
      p_bucket: query.bucket,
    });

    if (error) {
      throw new Error(`Unable to generate revenue report: ${error.message}`);
    }

    return (data as RevenueReportRpcRow[]).map((row) => ({
      bucket_start: row.bucket_start,
      total_open_amount: Number(row.total_open_amount),
      total_close_amount: Number(row.total_close_amount),
      total_revenue_amount: Number(row.total_revenue_amount),
      record_count: Number(row.record_count),
    }));
  }
}
