import type {
  CreateShiftRegistrationInput,
  ReviewShiftRegistrationInput,
  ShiftRegistration,
  ShiftRegistrationFilters,
} from "@/lib/domain/entities/ShiftRegistration";

export interface IShiftRegistrationRepository {
  findAll(filters: ShiftRegistrationFilters): Promise<ShiftRegistration[]>;
  findById(id: string): Promise<ShiftRegistration | null>;
  /** Inserts a PENDING registration for the caller in their own branch. */
  create(
    input: CreateShiftRegistrationInput & { employeeId: string; branchId: string },
  ): Promise<ShiftRegistration>;
  /** The employee withdraws their own PENDING registration. */
  cancel(id: string): Promise<ShiftRegistration>;
  /** Calls `review_shift_registration`; approval creates the assignment atomically. */
  review(
    id: string,
    input: ReviewShiftRegistrationInput,
  ): Promise<ShiftRegistration>;
}
