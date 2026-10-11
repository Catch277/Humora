import type {
  QuickSearchData,
  QuickSearchRequestResult,
  QuickSearchShiftResult,
  QuickSearchType,
  QuickSearchUserResult,
} from "@/lib/domain/entities/QuickSearch";
import type { IQuickSearchRepository } from "@/lib/domain/repositories/IQuickSearchRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

const RESULT_LIMIT = 10;

function escapeIlikePattern(query: string): string {
  return query.replace(/[\\%_]/g, "\\$&");
}

export class SupabaseQuickSearchRepository implements IQuickSearchRepository {
  async search(
    query: string,
    type: QuickSearchType,
  ): Promise<QuickSearchData> {
    const supabase = await createSupabaseServerClient();
    const pattern = `%${escapeIlikePattern(query)}%`;

    const usersQuery =
      type === "all" || type === "users"
        ? supabase
            .from("users")
            .select("id, full_name, role")
            .ilike("full_name", pattern)
            .limit(RESULT_LIMIT)
        : Promise.resolve({ data: [], error: null });

    const requestsQuery =
      type === "all" || type === "requests"
        ? supabase
            .from("requests")
            .select("id, branch_id, request_type, status, updated_at")
            .or(`request_type.ilike.${pattern},status.ilike.${pattern}`)
            .order("updated_at", { ascending: false })
            .limit(RESULT_LIMIT)
        : Promise.resolve({ data: [], error: null });

    const shiftsQuery =
      type === "all" || type === "shifts"
        ? supabase
            .from("shifts")
            .select("id, name, branch_id, start_time, end_time")
            .ilike("name", pattern)
            .limit(RESULT_LIMIT)
        : Promise.resolve({ data: [], error: null });

    const [usersResult, requestsResult, shiftsResult] = await Promise.all([
      usersQuery,
      requestsQuery,
      shiftsQuery,
    ]);

    if (usersResult.error) {
      throw new Error(`Unable to search users: ${usersResult.error.message}`);
    }

    if (requestsResult.error) {
      throw new Error(
        `Unable to search requests: ${requestsResult.error.message}`,
      );
    }

    if (shiftsResult.error) {
      throw new Error(`Unable to search shifts: ${shiftsResult.error.message}`);
    }

    return {
      users: usersResult.data as QuickSearchUserResult[],
      requests: requestsResult.data as QuickSearchRequestResult[],
      shifts: shiftsResult.data as QuickSearchShiftResult[],
    };
  }
}
