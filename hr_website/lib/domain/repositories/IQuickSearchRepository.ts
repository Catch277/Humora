import type {
  QuickSearchData,
  QuickSearchType,
} from "@/lib/domain/entities/QuickSearch";

export interface IQuickSearchRepository {
  search(query: string, type: QuickSearchType): Promise<QuickSearchData>;
}
