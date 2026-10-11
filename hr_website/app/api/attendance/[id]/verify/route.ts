/**
 * @swagger
 * /api/attendance/{id}/verify:
 *   patch:
 *     summary: Verify an attendance record
 *     description: |
 *       Stamps `verified_by` and `verified_at` on one record: this is the web review action of
 *       SCRUM-22 (toạ độ + ảnh xác minh + trạng thái hợp lệ). Restricted to managers (SCRUM-59
 *       `attendance:review`), and the `attendance_update_managers` RLS policy repeats the check in
 *       the database.
 *     tags:
 *       - Attendance
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: The verified attendance record.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Attendance'
 *       400:
 *         description: The id is not a UUID.
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
 *         description: The caller has no user profile, the role may not verify records, or they do not head that branch (SCRUM-61).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: The record does not exist or is not verifiable by the caller.
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

import { AttendanceNotFoundError } from "@/lib/domain/errors/AttendanceNotFoundError";
import { AttendanceVerifyForbiddenError } from "@/lib/domain/errors/AttendanceVerifyForbiddenError";
import { BranchForbiddenError } from "@/lib/domain/errors/BranchForbiddenError";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import { SupabaseAttendanceRepository } from "@/lib/infrastructure/repositories/SupabaseAttendanceRepository";
import { SupabaseBranchRepository } from "@/lib/infrastructure/repositories/SupabaseBranchRepository";
import { VerifyAttendanceUseCase } from "@/lib/usecases/VerifyAttendanceUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "The attendance id must be a UUID." },
      { status: 400 },
    );
  }

  try {
    // Verifying a check-in is a management action (SCRUM-59); the use case repeats the rule for the
    // role it is given, so the caller is still checked there as well.
    const caller = await requireCapability("attendance:review");

    if (!caller.ok) {
      return caller.response;
    }

    const verifyAttendance = new VerifyAttendanceUseCase(
      new SupabaseAttendanceRepository(),
      new SupabaseBranchRepository(),
    );
    const record = await verifyAttendance.execute({
      attendanceId: id,
      verifierId: caller.userId,
      verifierRole: caller.role,
    });

    return NextResponse.json(record);
  } catch (error) {
    if (error instanceof AttendanceNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof AttendanceVerifyForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof BranchForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof BranchNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Failed to verify attendance", error);
    return NextResponse.json(
      { error: "Unable to verify the attendance record." },
      { status: 500 },
    );
  }
}