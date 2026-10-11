import type { Attendance } from "@/lib/domain/entities/Attendance";
import { AttendanceNotFoundError } from "@/lib/domain/errors/AttendanceNotFoundError";
import { AttendanceVerifyForbiddenError } from "@/lib/domain/errors/AttendanceVerifyForbiddenError";
import type { IAttendanceRepository } from "@/lib/domain/repositories/IAttendanceRepository";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";
import { isManagerRole } from "@/lib/domain/roles";
import { assertBranchManagedBy } from "@/lib/usecases/branchScope";

export type VerifyAttendanceInput = {
  attendanceId: string;
  verifierId: string;
  verifierRole: string;
};

export class VerifyAttendanceUseCase {
  constructor(
    private readonly attendanceRepository: IAttendanceRepository,
    private readonly branchRepository: IBranchRepository,
  ) {}

  async execute(input: VerifyAttendanceInput): Promise<Attendance> {
    if (!isManagerRole(input.verifierRole)) {
      throw new AttendanceVerifyForbiddenError();
    }

    // SCRUM-61: verifying is a branch action, so the record's branch decides. Reading first also
    // turns "another branch's record" into a `403` instead of a bare `404`.
    const existing = await this.attendanceRepository.findById(input.attendanceId);

    if (!existing) {
      throw new AttendanceNotFoundError();
    }

    await assertBranchManagedBy(this.branchRepository, existing.branch_id, {
      userId: input.verifierId,
      role: input.verifierRole,
    });

    // `verify` throws AttendanceNotFoundError when RLS hides the row (the branch rules above already
    // refused the cases it would catch).
    return this.attendanceRepository.verify(input.attendanceId, input.verifierId);
  }
}