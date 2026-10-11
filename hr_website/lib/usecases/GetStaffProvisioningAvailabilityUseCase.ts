import type { StaffProvisioningAvailability } from "@/lib/domain/entities/StaffProvisioningAvailability";
import type { IStaffProvisioningService } from "@/lib/domain/repositories/IStaffProvisioningService";

export type GetStaffProvisioningAvailabilityInput = {
  callerToken: string;
};

/**
 * Answers whether the `staff-account` Edge Function can be used (SCRUM-52) and, when it cannot, which
 * of the reasons applies: not deployed, refusing this account, or failing on its own. The screen
 * offers the form only for `ready` and otherwise shows the matching instruction.
 */
export class GetStaffProvisioningAvailabilityUseCase {
  constructor(
    private readonly staffProvisioningService: IStaffProvisioningService,
  ) {}

  async execute(
    input: GetStaffProvisioningAvailabilityInput,
  ): Promise<StaffProvisioningAvailability> {
    return this.staffProvisioningService.checkAvailability(input.callerToken);
  }
}