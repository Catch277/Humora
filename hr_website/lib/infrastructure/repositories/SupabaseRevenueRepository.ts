import type {
  CreateRevenueRecordInput,
  RevenueRecord,
  RevenueRecordFilters,
  UpdateCloseRevenueInput,
} from "@/lib/domain/entities/RevenueRecord";
import { RevenueAlreadyDeclaredError } from "@/lib/domain/errors/RevenueAlreadyDeclaredError";
import type { IRevenueRepository } from "@/lib/domain/repositories/IRevenueRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

/**
 * One literal column list for every query in this file: the Supabase client infers the row type
 * from the string literal, and a computed string would collapse it to `GenericStringError`.
 */
const REVENUE_COLUMNS =
  "id, branch_id, open_amount, created_at, created_by, close_amount, close_note, close_image_url, closed_by, closed_at, audit_log";

/** The list is a screen, not an export, so it is capped instead of paginated. */
const MAX_LIST_ROWS = 100;

export class SupabaseRevenueRepository implements IRevenueRepository {
  async findByBranchInPeriod(
    branchId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<RevenueRecord | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("daily_revenue")
      .select(REVENUE_COLUMNS)
      .eq("branch_id", branchId)
      .gte("created_at", periodStart.toISOString())
      .lt("created_at", periodEnd.toISOString())
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to check opening revenue: ${error.message}`);
    }

    return data;
  }

  async findAll(filters: RevenueRecordFilters): Promise<RevenueRecord[]> {
    const supabase = await createSupabaseServerClient();

    let builder = supabase.from("daily_revenue").select(REVENUE_COLUMNS);

    if (filters.branchId) {
      builder = builder.eq("branch_id", filters.branchId);
    }

    if (filters.startAt) {
      builder = builder.gte("created_at", filters.startAt.toISOString());
    }

    if (filters.endAt) {
      builder = builder.lt("created_at", filters.endAt.toISOString());
    }

    if (filters.isClosed === true) {
      builder = builder.not("closed_at", "is", null);
    }

    if (filters.isClosed === false) {
      builder = builder.is("closed_at", null);
    }

    const { data, error } = await builder
      .order("created_at", { ascending: false })
      .limit(MAX_LIST_ROWS);

    if (error) {
      throw new Error(`Unable to load revenue records: ${error.message}`);
    }

    return data ?? [];
  }

  async create(input: CreateRevenueRecordInput): Promise<RevenueRecord> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("daily_revenue")
      .insert({
        branch_id: input.branchId,
        open_amount: input.openAmount,
        created_by: input.createdBy,
      })
      .select(REVENUE_COLUMNS)
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new RevenueAlreadyDeclaredError();
      }

      throw new Error(`Unable to declare opening revenue: ${error.message}`);
    }

    return data;
  }

  async updateCloseRevenue(
    id: string,
    input: UpdateCloseRevenueInput,
  ): Promise<RevenueRecord> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("daily_revenue")
      .update({
        close_amount: input.closeAmount,
        close_note: input.closeNote,
        close_image_url: input.closeImageUrl,
        closed_by: input.closedBy,
        closed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(REVENUE_COLUMNS)
      .single();

    if (error) {
      throw new Error(`Unable to declare closing revenue: ${error.message}`);
    }

    return data;
  }
}
