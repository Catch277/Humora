import type { User } from "@/lib/domain/entities/User";

export type QuickSearchType = "users" | "requests" | "shifts" | "all";

export interface QuickSearchUserResult {
  id: string;
  full_name: string;
  role: string;
}

export interface QuickSearchRequestResult {
  id: string;
  branch_id: string;
  request_type: string;
  status: string;
  updated_at: string;
}

export interface QuickSearchShiftResult {
  id: string;
  name: string;
  branch_id: string;
  start_time: string | null;
  end_time: string | null;
}

export interface QuickSearchData {
  users: QuickSearchUserResult[];
  requests: QuickSearchRequestResult[];
  shifts: QuickSearchShiftResult[];
}

export interface QuickSearchInput {
  query: string;
  type: QuickSearchType;
  currentUser: User;
}

export interface QuickSearchResult extends QuickSearchData {
  query: string;
  type: QuickSearchType;
  total: number;
}
