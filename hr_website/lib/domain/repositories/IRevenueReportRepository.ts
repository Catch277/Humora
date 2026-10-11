import type {
  RevenueReportPoint,
  RevenueReportQuery,
} from "@/lib/domain/entities/RevenueReport";

export interface IRevenueReportRepository {
  getAggregatedReport(query: RevenueReportQuery): Promise<RevenueReportPoint[]>;
}
