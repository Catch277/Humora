import type { ShiftRegistration } from "@/lib/domain/entities/ShiftRegistration";
import type { IShiftRegistrationRepository } from "@/lib/domain/repositories/IShiftRegistrationRepository";
import {
  assertManagerRole,
  assertUuid,
  normalizeDecision,
} from "@/lib/usecases/shiftWorkflowInput";

export type ReviewShiftRegistrationCommand = {
  registrationId: string;
  approve: boolean;
  rejectReason: string | null;
  callerRole: string;
};

/**
 * A manager decides a registration. Approving also creates the `shift_assignments` row, inside the
 * database function, in the same transaction — and refuses with a conflict when the person is on
 * leave or already works overlapping hours. Which branch the manager may act for is decided there
 * too (`heads_branch`), so the rule has one home.
 */
export class ReviewShiftRegistrationUseCase {
  constructor(private readonly repository: IShiftRegistrationRepository) {}

  execute(command: ReviewShiftRegistrationCommand): Promise<ShiftRegistration> {
    assertManagerRole(command.callerRole);
    assertUuid(command.registrationId, "The registration id");

    return this.repository.review(command.registrationId, {
      approve: command.approve,
      rejectReason: normalizeDecision(command.approve, command.rejectReason),
    });
  }
}
