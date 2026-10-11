/**
 * @swagger
 * /api/attendance/{id}:
 *   patch:
 *     summary: Correct an attendance record
 *     description: |
 *       Fixes the times, status and note of one record (SCRUM-23) and stamps `corrected_by`,
 *       `corrected_at` and `correction_reason`, so a manager can repair a wrong timesheet that
 *       payroll would otherwise trust. Restricted to managers (SCRUM-59 `attendance:review`): the
 *       route answers `403` for another role, the use case repeats the check and the
 *       `attendance_update_managers` RLS policy repeats it in the database. The reason is
 *       mandatory.
 *     tags:
 *       - Attendance
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - correction_reason
 *             properties:
 *               check_in_at:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               check_out_at:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [ON_TIME, LATE, EARLY_LEAVE, ABSENT, INCOMPLETE]
 *               note:
 *                 type: string
 *                 maxLength: 500
 *                 nullable: true
 *               correction_reason:
 *                 type: string
 *                 maxLength: 500
 *                 example: Máy chấm công lỗi, nhân viên có báo trước khi vào ca.
 *     responses:
 *       200:
 *         description: The corrected record.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Attendance'
 *       400:
 *         description: The id is not a UUID, the body is invalid, the reason is missing, or giờ ra precedes giờ vào.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: The caller has no user profile, the role may not correct records, or they do not head that branch (SCRUM-61).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: The record does not exist or is not correctable by the caller.
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

import { ATTENDANCE_STATUSES } from "@/lib/domain/entities/Attendance";
import { AttendanceCorrectionForbiddenError } from "@/lib/domain/errors/AttendanceCorrectionForbiddenError";
import { AttendanceNotFoundError } from "@/lib/domain/errors/AttendanceNotFoundError";
import { BranchForbiddenError } from "@/lib/domain/errors/BranchForbiddenError";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import { SupabaseAttendanceRepository } from "@/lib/infrastructure/repositories/SupabaseAttendanceRepository";
import { SupabaseBranchRepository } from "@/lib/infrastructure/repositories/SupabaseBranchRepository";
import { CorrectAttendanceUseCase } from "@/lib/usecases/CorrectAttendanceUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATUS_SET: ReadonlySet<string> = new Set(ATTENDANCE_STATUSES);

type CorrectionRequestBody = {
  check_in_at?: unknown;
  check_out_at?: unknown;
  status?: unknown;
  note?: unknown;
  correction_reason?: unknown;
};

/** A timestamp the client sends must be a real instant; the column type checks the rest. */
function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isOptionalTimestamp(value: unknown): boolean {
  return value === undefined || value === null || isIsoTimestamp(value);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "The attendance id must be a UUID." },
      { status: 400 },
    );
  }

  let body: CorrectionRequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    !isOptionalTimestamp(body.check_in_at) ||
    !isOptionalTimestamp(body.check_out_at)
  ) {
    return NextResponse.json(
      { error: "check_in_at and check_out_at must be ISO timestamps or null." },
      { status: 400 },
    );
  }

  const status = body.status ?? "ON_TIME";

  if (typeof status !== "string" || !STATUS_SET.has(status)) {
    return NextResponse.json(
      { error: `status must be one of ${ATTENDANCE_STATUSES.join(", ")}.` },
      { status: 400 },
    );
  }

  if (
    body.note !== undefined &&
    body.note !== null &&
    (typeof body.note !== "string" || body.note.length > 500)
  ) {
    return NextResponse.json(
      { error: "note must be a string of at most 500 characters." },
      { status: 400 },
    );
  }

  if (typeof body.correction_reason !== "string") {
    return NextResponse.json(
      { error: "correction_reason is required and must be a string." },
      { status: 400 },
    );
  }

  try {
    // Correcting a timesheet is a management action (SCRUM-59). The use case repeats the rule for
    // the role it is given, so the caller is still checked there as well.
    const caller = await requireCapability("attendance:review");

    if (!caller.ok) {
      return caller.response;
    }

    const correctAttendance = new CorrectAttendanceUseCase(
      new SupabaseAttendanceRepository(),
      new SupabaseBranchRepository(),
    );
    const record = await correctAttendance.execute({
      attendanceId: id,
      checkInAt: isIsoTimestamp(body.check_in_at) ? body.check_in_at : null,
      checkOutAt: isIsoTimestamp(body.check_out_at) ? body.check_out_at : null,
      status: status as (typeof ATTENDANCE_STATUSES)[number],
      note: typeof body.note === "string" ? body.note : null,
      correctionReason: body.correction_reason,
      // Ownership always comes from the session.
      correctorId: caller.userId,
      correctorRole: caller.role,
    });

    return NextResponse.json(record);
  } catch (error) {
    if (error instanceof AttendanceNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof AttendanceCorrectionForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof BranchForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof BranchNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (
      error instanceof Error &&
      (error.message.startsWith("correction_reason must") ||
        error.message.startsWith("status must") ||
        error.message.startsWith("check_out_at must"))
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to correct attendance", error);
    return NextResponse.json(
      { error: "Unable to correct the attendance record." },
      { status: 500 },
    );
  }
}