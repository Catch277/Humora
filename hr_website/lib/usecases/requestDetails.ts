import {
  requestNeedsSwapDetails,
  requestNeedsWorkDate,
  type RequestType,
} from "@/lib/domain/entities/RequestEntity";
import type { ShiftAssignment } from "@/lib/domain/entities/Shift";
import type { SwapCandidate } from "@/lib/domain/entities/SwapCandidate";
import { RequestShiftDetailsError } from "@/lib/domain/errors/RequestShiftDetailsError";
import { RequestSwapTargetNotFreeError } from "@/lib/domain/errors/RequestSwapTargetNotFreeError";
import type { IShiftAssignmentRepository } from "@/lib/domain/repositories/IShiftAssignmentRepository";
import type { ISwapCandidateRepository } from "@/lib/domain/repositories/ISwapCandidateRepository";
import { getBusinessDay } from "@/lib/usecases/businessDay";
import { isShiftAlreadyOver } from "@/lib/usecases/shiftWindow";

/**
 * The rules a đơn carries its own day by (SCRUM-82/83), in one place so the route handler (which answers
 * `400`/`409`), the use case and the screen read the same ones.
 *
 * Two of the three rules exist twice on purpose, like the past-ca guard does: this module is what the
 * caller reads as a sentence, and `requests_guard_shift_details` / `requests_apply_approved_effects`
 * (`SCRUM-83_request_effects.sql`) are what covers the writers this code cannot see — the Supabase
 * dashboard and any future client. The availability rule is *not* duplicated anywhere: both this module
 * and the approval ask `eligible_swap_targets()` / `shift_conflict_reason()` in the database.
 */
export type RequestDetails = {
  requestType: RequestType;
  workDate: string | null;
  shiftId: string | null;
  targetEmployeeId: string | null;
};

/** `YYYY-MM-DD` → `DD/MM/YYYY`, the way every Vietnamese sentence in this app writes a day. */
export function formatRequestDay(workDate: string): string {
  const [year, month, day] = workDate.split("-");

  return `${day}/${month}/${year}`;
}

/**
 * The three fields as they should be stored: whatever a type does not use is cleared, so a tampered body
 * cannot attach a ca and a colleague to a "Nghỉ phép" đơn and have the approval trigger read them.
 */
export function normalizeRequestDetails(input: RequestDetails): {
  workDate: string | null;
  shiftId: string | null;
  targetEmployeeId: string | null;
} {
  // "Khác" acts on nothing: it kept its old free-text shape on purpose (SCRUM-83).
  if (!requestNeedsWorkDate(input.requestType)) {
    return { workDate: null, shiftId: null, targetEmployeeId: null };
  }

  if (!requestNeedsSwapDetails(input.requestType)) {
    return { workDate: input.workDate, shiftId: null, targetEmployeeId: null };
  }

  return {
    workDate: input.workDate,
    shiftId: input.shiftId,
    targetEmployeeId: input.targetEmployeeId,
  };
}

/**
 * The day a đơn asks about, or a sentence saying why it cannot be acted on.
 *
 * Business time is Asia/Bangkok, so "today" is the organization's day and not the server's — the browser
 * computes the same value for the form's `min`, which is why the two never disagree about midnight.
 */
export function requireRequestWorkDate(
  workDate: string | null,
  requestType: RequestType,
  now: Date,
): string {
  if (!workDate) {
    throw new RequestShiftDetailsError(
      `Đơn “${requestType}” phải có ngày áp dụng.`,
    );
  }

  if (workDate < getBusinessDay(now)) {
    throw new RequestShiftDetailsError(
      `Ngày ${formatRequestDay(workDate)} đã qua nên không thể gửi đơn cho ngày đó. Chỉ gửi được đơn cho hôm nay hoặc những ngày sau.`,
    );
  }

  return workDate;
}

/**
 * The ca a "Nghỉ phép" đơn acts on (SCRUM-86): a day off is only meaningful on a day the employee is
 * actually scheduled.
 *
 * SCRUM-83's approval turns the day's ca into `LEAVE`, so without this rule a leave could name a day
 * nobody planned — and the approval would have to invent a row on the zero-length "Nghỉ" template, which
 * `/schedules` no longer draws (a day off is the marker inside the block of the ca it replaces).
 * `status = 'SCHEDULED'` is the same set the approval updates, so a ca that is already a day off or
 * cancelled cannot be "nghỉ" twice, and a zero-length template is not work — it can never be the ca a
 * đơn covers.
 */
export async function requireOwnShiftOnDay(
  assignmentRepository: IShiftAssignmentRepository,
  input: { employeeId: string; workDate: string },
): Promise<ShiftAssignment[]> {
  const sameDay = await assignmentRepository.findAll({
    employeeId: input.employeeId,
    startDate: input.workDate,
    endDate: input.workDate,
  });

  const scheduled = sameDay.filter(
    (row) =>
      row.status === "SCHEDULED" &&
      row.shift !== null &&
      row.shift.start_time !== null &&
      row.shift.end_time !== null &&
      row.shift.start_time !== row.shift.end_time,
  );

  if (scheduled.length === 0) {
    throw new RequestShiftDetailsError(
      `Bạn không có ca nào ngày ${formatRequestDay(input.workDate)} nên không thể gửi đơn nghỉ phép. Chọn ngày bạn có ca làm việc.`,
    );
  }

  return scheduled;
}

/** Both ids of a "Đổi ca" đơn, or a sentence naming what is missing. */
export function requireSwapIds(
  shiftId: string | null,
  targetEmployeeId: string | null,
): { shiftId: string; targetEmployeeId: string } {
  if (!shiftId || !targetEmployeeId) {
    throw new RequestShiftDetailsError(
      "Đơn đổi ca phải có ca cần đổi và đồng nghiệp sẽ nhận ca đó.",
    );
  }

  return { shiftId, targetEmployeeId };
}

/**
 * The ca a "Đổi ca" đơn hands over has to be the caller's own, on the day they named, and still ahead.
 *
 * The read goes through `IShiftAssignmentRepository`, whose RLS scope (SCRUM-63) is exactly the evidence
 * needed: an `EMPLOYEE` sees their own rows and a `MANAGER` the whole organization — and a manager holds
 * no ca at all, because a ca is covered by staff (`isEmployeeRole`), so their list is empty and the
 * sentence is the honest answer. `isShiftAlreadyOver` is the same guard `POST /api/schedules` uses
 * (SCRUM-81): a ca nobody can clock in for cannot be handed over either.
 */
export async function requireOwnShiftAssignment(
  assignmentRepository: IShiftAssignmentRepository,
  input: { employeeId: string; workDate: string; shiftId: string; now: Date },
): Promise<ShiftAssignment> {
  const sameDay = await assignmentRepository.findAll({
    employeeId: input.employeeId,
    startDate: input.workDate,
    endDate: input.workDate,
  });

  const assignment = sameDay.find(
    (row) => row.shift_id === input.shiftId && row.status === "SCHEDULED",
  );

  if (!assignment || !assignment.shift) {
    throw new RequestShiftDetailsError(
      `Bạn không được xếp ca này ngày ${formatRequestDay(input.workDate)} nên không thể xin đổi ca. Chọn một ca trong lịch của bạn.`,
    );
  }

  if (isShiftAlreadyOver(input.now, input.workDate, assignment.shift)) {
    throw new RequestShiftDetailsError(
      `Ca “${assignment.shift.name}” ngày ${formatRequestDay(input.workDate)} đã kết thúc nên không thể xin đổi ca nữa. Chọn ca hoặc ngày khác.`,
    );
  }

  return assignment;
}

/**
 * The colleague named in a "Đổi ca" đơn has to be one the picker offers.
 *
 * The list comes from `ISwapCandidateRepository`, i.e. from `eligible_swap_targets()` — the same
 * `security definer` rule the approval re-checks — so this is a membership test and never a second copy
 * of "who is free". It is what refuses an id posted by hand: another branch's employee, an account that
 * has left, the caller themselves, or somebody who took an overlapping ca in the meantime.
 */
export async function requireEligibleSwapTarget(
  candidateRepository: ISwapCandidateRepository,
  input: { workDate: string; shiftId: string; targetEmployeeId: string },
): Promise<SwapCandidate> {
  const candidates = await candidateRepository.findEligible(
    input.workDate,
    input.shiftId,
  );
  const candidate = candidates.find((row) => row.id === input.targetEmployeeId);

  if (!candidate) {
    throw new RequestSwapTargetNotFreeError(
      `Đồng nghiệp được chọn không rảnh trong ca này ngày ${formatRequestDay(input.workDate)}. Vui lòng chọn lại người nhận ca.`,
    );
  }

  return candidate;
}
