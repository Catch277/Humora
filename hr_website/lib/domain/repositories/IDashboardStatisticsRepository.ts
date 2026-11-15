import type {
  OperationSeriesQuery,
  OperationSeriesRow,
  WorkforceQuery,
  WorkforceRow,
} from "@/lib/domain/entities/DashboardStatistics";

/**
 * The dashboard's read model (A5/SCRUM-98).
 *
 * Two calls, because the answer has two grains: a time bucket (summable revenue and attendance counts)
 * and a branch (distinct headcounts that must not be summed across days). Both run through a
 * `security invoker` RPC, so RLS still decides which rows exist.
 */
export interface IDashboardStatisticsRepository {
  getOperationSeries(query: OperationSeriesQuery): Promise<OperationSeriesRow[]>;
  getWorkforce(query: WorkforceQuery): Promise<WorkforceRow[]>;
}
