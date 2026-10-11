import type {
  ShiftRegistration,
  ShiftRegistrationFilters,
} from "@/lib/domain/entities/ShiftRegistration";
import type { IShiftRegistrationRepository } from "@/lib/domain/repositories/IShiftRegistrationRepository";
import { MANAGER_ROLES, normalizeRole } from "@/lib/domain/roles";

export type ListShiftRegistrationsCommand = {
  filters: ShiftRegistrationFilters;
  callerId: string;
  callerRole: string;
};

/**
 * A manager lists with whatever filters they asked for (RLS keeps it inside their organization).
 * An employee only ever sees their own, whatever the query string says — RLS would enforce it too,
 * but the filter makes the answer exact instead of relying on a policy.
 */
export class ListShiftRegistrationsUseCase {
  constructor(private readonly repository: IShiftRegistrationRepository) {}

  execute(command: ListShiftRegistrationsCommand): Promise<ShiftRegistration[]> {
    if (MANAGER_ROLES.has(normalizeRole(command.callerRole))) {
      return this.repository.findAll(command.filters);
    }

    return this.repository.findAll({
      ...command.filters,
      employeeId: command.callerId,
    });
  }
}
