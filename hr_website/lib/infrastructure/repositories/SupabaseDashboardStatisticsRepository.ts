import type {
  OperationSeriesQuery,
  OperationSeriesRow,
  WorkforceQuery,
  WorkforceRow,
} from "@/lib/domain/entities/DashboardStatistics";
import type { IDashboardStatisticsRepository } from "@/lib/domain/repositories/IDashboardStatisticsRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

/**
 * The `get_dashboard_operations` / `get_dashboard_workforce` rows as PostgREST answers them
 * (SCRUM-98). Numeric columns arrive as strings, so every field is read through `toNumber` below.
 */
type OperationRpcRow = {
  bucket_start: string;
  branch_id: string | null;
  branch_name: string | null;
  revenue_amount: number | string | null;
  revenue_records: number | string | null;
  attendance_total: number | string | null;
  on_time: number | string | null;
  late: number | string | null;
  early_leave: number | string | null;
  absent: number | string | null;
  incomplete: number | string | null;
};

type WorkforceRpcRow = {
  branch_id: string | null;
  branch_name: string | null;
  employee_total: number | string | null;
  employee_active: number | string | null;
  employee_resigned: number | string | null;
  scheduled_total: number | string | null;
  no_show_total: number | string | null;
  working_employees: number | string | null;
  absent_employees: number | string | null;
};

function toNumber(value: number | string | null): number {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

export class SupabaseDashboardStatisticsRepository
  implements IDashboardStatisticsRepository
{
  async getOperationSeries(
    query: OperationSeriesQuery,
  ): Promise<OperationSeriesRow[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_dashboard_operations", {
      p_branch_id: query.branchId ?? null,
      p_start_date: query.startDate,
      p_end_date: query.endDate,
      p_bucket: query.bucket,
    });

    if (error) {
      throw new Error(`Unable to load dashboard operations: ${error.message}`);
    }

    // The client cannot infer a signature for a function it does not know, so the rows are declared
    // locally above instead of trusting `data`'s shape.
    return ((data ?? []) as unknown as OperationRpcRow[]).map((row) => ({
      bucket_start: row.bucket_start,
      branch_id: row.branch_id,
      branch_name: row.branch_name,
      revenue_amount: toNumber(row.revenue_amount),
      revenue_records: toNumber(row.revenue_records),
      attendance_total: toNumber(row.attendance_total),
      on_time: toNumber(row.on_time),
      late: toNumber(row.late),
      early_leave: toNumber(row.early_leave),
      absent: toNumber(row.absent),
      incomplete: toNumber(row.incomplete),
    }));
  }

  async getWorkforce(query: WorkforceQuery): Promise<WorkforceRow[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_dashboard_workforce", {
      p_branch_id: query.branchId ?? null,
      p_start_date: query.startDate,
      p_end_date: query.endDate,
    });

    if (error) {
      throw new Error(`Unable to load dashboard workforce: ${error.message}`);
    }

    return ((data ?? []) as unknown as WorkforceRpcRow[]).map((row) => ({
      branch_id: row.branch_id,
      branch_name: row.branch_name,
      employee_total: toNumber(row.employee_total),
      employee_active: toNumber(row.employee_active),
      employee_resigned: toNumber(row.employee_resigned),
      scheduled_total: toNumber(row.scheduled_total),
      no_show_total: toNumber(row.no_show_total),
      working_employees: toNumber(row.working_employees),
      absent_employees: toNumber(row.absent_employees),
    }));
  }
}
