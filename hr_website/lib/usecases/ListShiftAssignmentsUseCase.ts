import type {
  ShiftAssignment,
  ShiftAssignmentFilters,
} from "@/lib/domain/entities/Shift";
import type { IShiftAssignmentRepository } from "@/lib/domain/repositories/IShiftAssignmentRepository";

export class ListShiftAssignmentsUseCase {
  constructor(
    private readonly assignmentRepository: IShiftAssignmentRepository,
  ) {}

  async execute(filters: ShiftAssignmentFilters): Promise<ShiftAssignment[]> {
    return this.assignmentRepository.findAll(filters);
  }
}
