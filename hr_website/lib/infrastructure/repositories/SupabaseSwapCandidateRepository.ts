import type { SwapCandidate } from "@/lib/domain/entities/SwapCandidate";
import type { ISwapCandidateRepository } from "@/lib/domain/repositories/ISwapCandidateRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

/**
 * Row shape as the RPC returns it. Declared locally because the client has no generated Database type;
 * `full_name` is not declared `NOT NULL` on `public.users`, so it may arrive as null.
 */
type CandidateRow = { id: string; full_name: string | null };

/**
 * The "Đổi ca" picker, backed by `eligible_swap_targets()` (SCRUM-82).
 *
 * The RPC — not this class — decides who may be offered: it filters by branch, role and availability in
 * SQL, where the same `shift_conflict_reason()` the approval uses is available. Duplicating that rule in
 * TypeScript would let the list and the approval drift, which is how a manager ends up with a swap the
 * database refuses.
 */
export class SupabaseSwapCandidateRepository
  implements ISwapCandidateRepository
{
  async findEligible(workDate: string, shiftId: string): Promise<SwapCandidate[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("eligible_swap_targets", {
      p_work_date: workDate,
      p_shift_id: shiftId,
    });

    if (error) {
      throw new Error(`Unable to load swap candidates: ${error.message}`);
    }

    // A profile without a name renders as a blank option rather than breaking the picker, which is the
    // same degradation the schedule and the request queue already accept for a missing name.
    return ((data ?? []) as CandidateRow[]).map((row) => ({
      id: row.id,
      full_name: row.full_name ?? "",
    }));
  }
}
