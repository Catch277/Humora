/**
 * @swagger
 * /api/attendance/check-in:
 *   post:
 *     summary: Clock in
 *     description: |
 *       Records one arrival (SCRUM-68): `check_in_at`, the GPS point it was taken at and the status the
 *       ca's hours justify (`ON_TIME`, or `LATE` beyond a five-minute grace). The distance is derived by
 *       the database from the point against the branch centre, so it is never part of the request.
 *
 *       An `EMPLOYEE` clocks in against a ca they are scheduled for on that business day — `shift_id` is
 *       required and the branch (and the hours) come from that assignment, which must be their own
 *       branch. A `MANAGER` names a branch they are the chi nhánh trưởng of (SCRUM-61) and may name a ca
 *       (`shift_id`, any template of the catalogue).
 *
 *       The organization's `OWNER` never clocks in (`attendance:checkin` is not theirs, SCRUM-68), so
 *       this endpoint answers `403` for them and `attendance_insert_own` refuses the row in the database.
 *
 *       The point is recorded, not judged: an arrival outside the branch geofence is stored like any
 *       other and the reviewer reads the verdict on `/attendance`.
 *
 *       A ca is clocked in **inside its working time**: the window is `[start − 5', end − 5']`, the same
 *       grace that decides Đi muộn and that governs "Vào ca lại". An arrival before it opens answers
 *       `409` with its own sentence, one after it has closed answers `409` as well. An unscheduled
 *       arrival (a manager who named no ca) and a template without hours have no window and stay allowed.
 *
 *       Sending the same ca again is **"Vào ca lại"** while that ca is still running: an employee who
 *       closed it by mistake gets the same row back, re-opened (`200`), with the giờ vào they reported
 *       still in place — a second tap is not a second record. The status is re-derived from that giờ vào
 *       (so a row an earlier check-out had stamped "Về sớm" reads `LATE` again when the arrival was in
 *       fact late), and a manager's correction is never overwritten. Once the ca is over the check-out
 *       stands (`409`), and a row that is still open is a plain duplicate (`409`).
 *     tags:
 *       - Attendance
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               latitude:
 *                 type: number
 *                 format: double
 *                 nullable: true
 *                 example: 10.7769
 *                 description: Required together with `longitude`; omit both when the device refused a location.
 *               longitude:
 *                 type: number
 *                 format: double
 *                 nullable: true
 *                 example: 106.7009
 *               branch_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: The branch a MANAGER clocks in at. Required for them, ignored for an employee.
 *               shift_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: The ca being started. Required for an employee (today's `SCHEDULED` assignment); optional for a manager.
 *               note:
 *                 type: string
 *                 maxLength: 500
 *                 nullable: true
 *     responses:
 *       201:
 *         description: The created attendance record, with its derived distance and embedded branch/shift.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Attendance'
 *       200:
 *         description: The existing record, re-opened ("Vào ca lại") because the ca is still running.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Attendance'
 *       400:
 *         description: The JSON body is invalid, the coordinates are not a pairable pair, or a manager sent no branch.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: The caller is the organization's owner (SCRUM-68), belongs to no branch, or named a branch they do not head.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: The branch or the ca does not exist (or is not visible to the caller).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: This ca is already open for today (or its working time is over, so the check-out stands), the arrival is outside the ca's working time, or the caller has no ca scheduled for this business day.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: An unexpected server error occurred.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse } from "next/server";

import { requireCapability } from "@/app/api/_lib/requireCaller";
import { parseCheckInRequest } from "@/app/api/attendance/_lib/checkRequest";
import { AttendanceAlreadyCheckedInError } from "@/lib/domain/errors/AttendanceAlreadyCheckedInError";
import { AttendanceBranchNotAssignedError } from "@/lib/domain/errors/AttendanceBranchNotAssignedError";
import { AttendanceBranchRequiredError } from "@/lib/domain/errors/AttendanceBranchRequiredError";
import { AttendanceCheckInForbiddenError } from "@/lib/domain/errors/AttendanceCheckInForbiddenError";
import { AttendanceNoShiftTodayError } from "@/lib/domain/errors/AttendanceNoShiftTodayError";
import { AttendanceShiftEndedError } from "@/lib/domain/errors/AttendanceShiftEndedError";
import { AttendanceShiftNotStartedError } from "@/lib/domain/errors/AttendanceShiftNotStartedError";
import { BranchForbiddenError } from "@/lib/domain/errors/BranchForbiddenError";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import { ShiftNotFoundError } from "@/lib/domain/errors/ShiftNotFoundError";
import { SupabaseAttendanceRepository } from "@/lib/infrastructure/repositories/SupabaseAttendanceRepository";
import { SupabaseBranchRepository } from "@/lib/infrastructure/repositories/SupabaseBranchRepository";
import { SupabaseShiftAssignmentRepository } from "@/lib/infrastructure/repositories/SupabaseShiftAssignmentRepository";
import { SupabaseShiftRepository } from "@/lib/infrastructure/repositories/SupabaseShiftRepository";
import { RecordCheckInUseCase } from "@/lib/usecases/RecordCheckInUseCase";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Nội dung yêu cầu phải là JSON hợp lệ." }, { status: 400 });
  }

  const parsed = parseCheckInRequest(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    // Clocking in is everybody's own action except the owner's (SCRUM-68). The check constraint, the use
    // case's own rule and `attendance_insert_own` all repeat it — this is the `403` the caller reads.
    const caller = await requireCapability("attendance:checkin");

    if (!caller.ok) {
      return caller.response;
    }

    const recordCheckIn = new RecordCheckInUseCase(
      new SupabaseAttendanceRepository(),
      new SupabaseShiftAssignmentRepository(),
      new SupabaseShiftRepository(),
      new SupabaseBranchRepository(),
    );

    const result = await recordCheckIn.execute({
      callerId: caller.userId,
      callerRole: caller.role,
      callerBranchId: caller.profile.branch_id,
      latitude: parsed.input.latitude,
      longitude: parsed.input.longitude,
      branchId: parsed.input.branchId,
      shiftId: parsed.input.shiftId,
      note: parsed.input.note,
    });

    // `201` when a row was created; `200` when an existing one was re-opened ("Vào ca lại"), which is the
    // same resource being updated rather than a second one being born.
    return NextResponse.json(result.attendance, {
      status: result.created ? 201 : 200,
    });
  } catch (error) {
    if (
      error instanceof AttendanceCheckInForbiddenError ||
      error instanceof AttendanceBranchNotAssignedError ||
      error instanceof BranchForbiddenError
    ) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (
      error instanceof BranchNotFoundError ||
      error instanceof ShiftNotFoundError
    ) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof AttendanceBranchRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // `schedule:view` lets an employee read today's plan, so "no ca today" is a state, not a permission.
    // The window refusals are the same shape: the ca exists and was named correctly, the clock is what
    // says no, and each carries its own sentence.
    if (
      error instanceof AttendanceAlreadyCheckedInError ||
      error instanceof AttendanceNoShiftTodayError ||
      error instanceof AttendanceShiftNotStartedError ||
      error instanceof AttendanceShiftEndedError
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("Failed to record check-in", error);
    return NextResponse.json(
      { error: "Không thể ghi nhận vào ca." },
      { status: 500 },
    );
  }
}
