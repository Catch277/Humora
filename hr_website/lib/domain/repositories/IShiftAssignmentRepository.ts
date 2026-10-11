import type {
  CreateShiftAssignmentInput,
  ShiftAssignment,
  ShiftAssignmentFilters,
  UpdateShiftAssignmentInput,
} from "@/lib/domain/entities/Shift";

export interface IShiftAssignmentRepository {
  findAll(filters: ShiftAssignmentFilters): Promise<ShiftAssignment[]>;
  /** One assignment as the caller may see it; the write rules need its `branch_id` (SCRUM-61). */
  findById(id: string): Promise<ShiftAssignment | null>;
  create(input: CreateShiftAssignmentInput): Promise<ShiftAssignment>;
  update(
    id: string,
    input: UpdateShiftAssignmentInput,
  ): Promise<ShiftAssignment>;
  delete(id: string): Promise<void>;
}
