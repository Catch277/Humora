import type {
  Attendance,
  AttendanceExceptionStatus,
} from "@/lib/domain/entities/Attendance";
import { AttendanceExceptionInputError } from "@/lib/domain/errors/AttendanceExceptionInputError";
import { AttendanceNotFoundError } from "@/lib/domain/errors/AttendanceNotFoundError";
import type { IAttendanceRepository } from "@/lib/domain/repositories/IAttendanceRepository";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";
import { assertBranchManagedBy } from "@/lib/usecases/branchScope";

/** Mirrors the length the route and the page enforce; the column itself is free text. */
export const MAX_EXCEPTION_NOTE_LENGTH = 500;

export type ResolveAttendanceExceptionInput = {
  attendanceId: string;
  status: AttendanceExceptionStatus;
  note: string | null;
  /** From the session, never from the body. */
  resolverId: string;
  resolverRole: string;
};

/**
 * Closes (or re-opens) the anomaly of one row (SCRUM-97 / A4 "Automated Timekeeping").
 *
 * Why this is not `correct`: a correction rewrites the times the employee reported and is the evidence
 * payroll uses; a resolution only records that somebody investigated a derived anomaly and what they
 * decided. Keeping them apart means closing a "late arrival" never changes the arrival time.
 *
 * The branch scope is the same rule the correction and complaint flows use — a chi nhánh trưởng answers
 * only for a branch they head — and it runs *before* the write, so the caller reads a sentence instead
 * of a policy that silently matched no row.
 */
export class ResolveAttendanceExceptionUseCase {
  constructor(
    private readonly attendanceRepository: IAttendanceRepository,
    private readonly branchRepository: IBranchRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: ResolveAttendanceExceptionInput): Promise<Attendance> {
    const record = await this.attendanceRepository.findById(input.attendanceId);

    if (!record) {
      throw new AttendanceNotFoundError();
    }

    await assertBranchManagedBy(this.branchRepository, record.branch_id, {
      userId: input.resolverId,
      role: input.resolverRole,
    });

    const note = input.note?.trim() || null;

    if (input.status === "RESOLVED" && !note) {
      throw new AttendanceExceptionInputError(
        "Cần ghi rõ cách xử lý trước khi đóng bất thường.",
      );
    }

    if (note && note.length > MAX_EXCEPTION_NOTE_LENGTH) {
      throw new AttendanceExceptionInputError(
        `Nội dung xử lý tối đa ${MAX_EXCEPTION_NOTE_LENGTH} ký tự.`,
      );
    }

    return this.attendanceRepository.resolveException(input.attendanceId, {
      status: input.status,
      note,
      resolverId: input.resolverId,
      resolvedAt: this.now().toISOString(),
    });
  }
}
