import type {
  StaffMember,
  UpdateStaffInput,
} from "@/lib/domain/entities/StaffMember";
import type { User } from "@/lib/domain/entities/User";

export interface IUserRepository {
  getById(id: string): Promise<User | null>;
  /** The staff directory (SCRUM-24); a SCRUM-59 manager view (`directory:view`), enforced by RLS and the use case. */
  findAll(): Promise<StaffMember[]>;
  /** Changes a role and/or the employment state of one account. */
  update(id: string, input: UpdateStaffInput): Promise<StaffMember>;
  /**
   * Clears `must_change_password` for the calling account (SCRUM-52) through the narrow
   * `complete_password_change` RPC: an employee cannot update their own `users` row otherwise.
   */
  completePasswordChange(): Promise<void>;
}
