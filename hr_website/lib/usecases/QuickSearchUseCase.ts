import type {
  QuickSearchInput,
  QuickSearchResult,
} from "@/lib/domain/entities/QuickSearch";
import { QuickSearchForbiddenError } from "@/lib/domain/errors/QuickSearchForbiddenError";
import type { IQuickSearchRepository } from "@/lib/domain/repositories/IQuickSearchRepository";

export class QuickSearchUseCase {
  constructor(private readonly quickSearchRepository: IQuickSearchRepository) {}

  async execute(input: QuickSearchInput): Promise<QuickSearchResult> {
    const query = input.query.trim();

    if (query.length < 2) {
      throw new Error("q must contain at least 2 characters.");
    }

    if (!input.currentUser.role.trim()) {
      throw new QuickSearchForbiddenError();
    }

    // The repository creates a Supabase client from this request's session,
    // so every table query remains constrained by the caller's RLS policies.
    const results = await this.quickSearchRepository.search(query, input.type);

    return {
      query,
      type: input.type,
      total:
        results.users.length + results.requests.length + results.shifts.length,
      ...results,
    };
  }
}
