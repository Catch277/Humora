import type {
  CreateRevenueRecordInput,
  RevenueRecord,
  RevenueRecordFilters,
  UpdateCloseRevenueInput,
} from "@/lib/domain/entities/RevenueRecord";

export interface IRevenueRepository {
  findByBranchInPeriod(
    branchId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<RevenueRecord | null>;
  /** The records themselves, newest first, for the Doanh thu screen. */
  findAll(filters: RevenueRecordFilters): Promise<RevenueRecord[]>;
  create(input: CreateRevenueRecordInput): Promise<RevenueRecord>;
  updateCloseRevenue(
    id: string,
    input: UpdateCloseRevenueInput,
  ): Promise<RevenueRecord>;
}
