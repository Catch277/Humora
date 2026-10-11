import type { Attendance } from "@/lib/domain/entities/Attendance";
import { AttendanceComplaintForbiddenError } from "@/lib/domain/errors/AttendanceComplaintForbiddenError";
import { AttendanceNotFoundError } from "@/lib/domain/errors/AttendanceNotFoundError";
import type { IAttendanceRepository } from "@/lib/domain/repositories/IAttendanceRepository";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";
import { isManagerRole } from "@/lib/domain/roles";
import { assertBranchManagedBy } from "@/lib/usecases/branchScope";

const MAX_COMPLAINT_LENGTH = 500;

export type RecordAttendanceComplaintInput = {
  attendanceId: string;
  complaint: string;
  callerId: string;
  callerRole: string;
};

export class RecordAttendanceComplaintUseCase {
  constructor(
    private readonly attendanceRepository: IAttendanceRepository,
    private readonly branchRepository: IBranchRepository,
  ) {}

  async execute(input: RecordAttendanceComplaintInput): Promise<Attendance> {
    const complaint = input.complaint.trim();

    if (!complaint || complaint.length > MAX_COMPLAINT_LENGTH) {
      throw new Error(
        `complaint must be a non-empty string of at most ${MAX_COMPLAINT_LENGTH} characters.`,
      );
    }

    const record = await this.attendanceRepository.findById(input.attendanceId);

    if (!record) {
      throw new AttendanceNotFoundError();
    }

    // The employee on the record may complain about their own timesheet; a manager may raise it
    // for them (the complaint often arrives by phone). Anyone else is refused.
    const isOwner = record.employee_id === input.callerId;
    const isManager = isManagerRole(input.callerRole);

    if (!isOwner && !isManager) {
      throw new AttendanceComplaintForbiddenError();
    }

    // SCRUM-61 narrows the manager path to their own branch. The employee's own complaint is not a
    // branch action — they manage nothing — so it deliberately skips this check.
    if (!isOwner) {
      await assertBranchManagedBy(this.branchRepository, record.branch_id, {
        userId: input.callerId,
        role: input.callerRole,
      });
    }

    return this.attendanceRepository.recordComplaint(record.id, complaint);
  }
}