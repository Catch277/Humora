import type { ShiftRegistration } from "@/lib/domain/entities/ShiftRegistration";
import { ShiftRegistrationNotFoundError } from "@/lib/domain/errors/ShiftRegistrationNotFoundError";
import { ShiftWorkflowStateError } from "@/lib/domain/errors/ShiftWorkflowStateError";
import type { IShiftRegistrationRepository } from "@/lib/domain/repositories/IShiftRegistrationRepository";
import { assertUuid } from "@/lib/usecases/shiftWorkflowInput";

export type CancelShiftRegistrationCommand = {
  registrationId: string;
  callerId: string;
};

/** The employee withdraws their own PENDING registration. Somebody else's looks like a missing one. */
export class CancelShiftRegistrationUseCase {
  constructor(private readonly repository: IShiftRegistrationRepository) {}

  async execute(
    command: CancelShiftRegistrationCommand,
  ): Promise<ShiftRegistration> {
    assertUuid(command.registrationId, "Mã đăng ký ca");

    const registration = await this.repository.findById(command.registrationId);

    if (!registration || registration.employee_id !== command.callerId) {
      throw new ShiftRegistrationNotFoundError();
    }

    if (registration.status !== "PENDING") {
      throw new ShiftWorkflowStateError(
        "Chỉ đăng ký đang chờ duyệt mới huỷ được.",
      );
    }

    return this.repository.cancel(registration.id);
  }
}
