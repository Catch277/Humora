import type { SwapCandidate } from "@/lib/domain/entities/SwapCandidate";

export interface ISwapCandidateRepository {
  /**
   * The colleagues who may take `shiftId` on `workDate`: the caller's own branch, `EMPLOYEE` and active
   * only, never the caller, and free in that ca — the same rule the approval re-checks before it moves
   * anything (SCRUM-83), so the picker can never offer a swap that would fail.
   *
   * RLS cannot answer this: the `shift_assignments` read policy (SCRUM-63) shows an `EMPLOYEE` only their
   * own rows, so an implementation has to ask the `security definer` RPC that owns the rule.
   */
  findEligible(workDate: string, shiftId: string): Promise<SwapCandidate[]>;
}
