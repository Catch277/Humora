import type { Attendance } from "@/lib/domain/entities/Attendance";
import { AttendanceComplaintForbiddenError } from "@/lib/domain/errors/AttendanceComplaintForbiddenError";
import { AttendanceNotFoundError } from "@/lib/domain/errors/AttendanceNotFoundError";
import type { IAttendanceRepository } from "@/lib/domain/repositories/IAttendanceRepository";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";
import { isManagerRole } from "@/lib/domain/roles";
import { assertBranchManagedBy } from "@/lib/usecases/branchScope";

export type ResolveAttendanceComplaintInput = {
  attendanceId: string;
  resolverId: string;
  resolverRole: string;
};

export class ResolveAttendanceComplaintUseCase {
  constructor(
    private readonly attendanceRepository: IAttendanceRepository,
    private readonly branchRepository: IBranchRepository,
  ) {}

  async execute(input: ResolveAttendanceComplaintInput): Promise<Attendance> {
    // Closing a complaint is a management decision, so only a manager may do it — unlike raising
    // one, which the employee themselves does from the mobile app.
    if (!isManagerRole(input.resolverRole)) {
      throw new AttendanceComplaintForbiddenError();
    }

    const record = await this.attendanceRepository.findById(input.attendanceId);

    if (!record) {
      throw new AttendanceNotFoundError();
    }

    if (!record.complaint) {
      throw new Error("This attendance record has no complaint to resolve.");
    }

    // SCRUM-61: closing a complaint is a branch action, so a manager may only close their own.
    await assertBranchManagedBy(this.branchRepository, record.branch_id, {
      userId: input.resolverId,
      role: input.resolverRole,
    });

    return this.attendanceRepository.resolveComplaint(
      record.id,
      input.resolverId,
    );
  }
}