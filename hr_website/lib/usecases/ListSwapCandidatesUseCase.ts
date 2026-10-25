import type { SwapCandidate } from "@/lib/domain/entities/SwapCandidate";
import type { ISwapCandidateRepository } from "@/lib/domain/repositories/ISwapCandidateRepository";

/**
 * The colleagues a "Đổi ca" đơn may name (SCRUM-82), for the picker on `/requests`.
 *
 * There is deliberately no rule in this class: who may be offered is one `security definer` function
 * (`public.eligible_swap_targets()`) that filters by branch, `EMPLOYEE` role, `is_active` and
 * availability, and the route handler only checks that it was asked a well-formed question. A copy of
 * that rule here would be a second answer to "who is free", and the approval — which re-asks the same
 * function — would eventually disagree with the picker.
 */
export class ListSwapCandidatesUseCase {
  constructor(private readonly candidateRepository: ISwapCandidateRepository) {}

  async execute(input: {
    workDate: string;
    shiftId: string;
  }): Promise<SwapCandidate[]> {
    return this.candidateRepository.findEligible(input.workDate, input.shiftId);
  }
}
