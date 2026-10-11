import type { StaffMember } from "@/lib/domain/entities/StaffMember";
import { StaffForbiddenError } from "@/lib/domain/errors/StaffForbiddenError";
import type { IUserRepository } from "@/lib/domain/repositories/IUserRepository";
import { isManagerRole } from "@/lib/domain/roles";

export type ListStaffInput = {
  callerRole: string;
};

export class ListStaffUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(input: ListStaffInput): Promise<StaffMember[]> {
    // The staff directory is narrower than the `users` read policy on purpose: the table also
    // backs the schedule and request embeds, but only a manager needs the whole list.
    if (!isManagerRole(input.callerRole)) {
      throw new StaffForbiddenError();
    }

    return this.userRepository.findAll();
  }
}