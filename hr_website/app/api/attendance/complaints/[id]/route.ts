/**
 * @swagger
 * /api/attendance/complaints/{id}:
 *   patch:
 *     summary: Resolve a complaint on an attendance record
 *     description: |
 *       Closes an open khiếu nại (SCRUM-23): sets `complaint_status` to `RESOLVED` and stamps
 *       `complaint_resolved_by` / `complaint_resolved_at`. Only a manager (OWNER/MANAGER) may resolve
 *       one — SCRUM-59 `attendance:review` — while the employee on the record may raise it
 *       (POST /api/attendance/complaints).
 *     tags:
 *       - Attendance
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The attendance record id that carries the complaint.
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
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [RESOLVED]
 *     responses:
 *       200:
 *         description: The attendance record with the complaint resolved.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Attendance'
 *       400:
 *         description: The id is not a UUID, the body is invalid, or the record has no complaint.
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
 *         description: The caller has no user profile, the role may not resolve complaints, or they do not head that branch (SCRUM-61).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: The attendance record does not exist.
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

import { AttendanceComplaintForbiddenError } from "@/lib/domain/errors/AttendanceComplaintForbiddenError";
import { AttendanceNotFoundError } from "@/lib/domain/errors/AttendanceNotFoundError";
import { BranchForbiddenError } from "@/lib/domain/errors/BranchForbiddenError";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import { SupabaseAttendanceRepository } from "@/lib/infrastructure/repositories/SupabaseAttendanceRepository";
import { SupabaseBranchRepository } from "@/lib/infrastructure/repositories/SupabaseBranchRepository";
import { ResolveAttendanceComplaintUseCase } from "@/lib/usecases/ResolveAttendanceComplaintUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  let body: { status?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.status !== "RESOLVED") {
    return NextResponse.json(
      { error: "status must be RESOLVED." },
      { status: 400 },
    );
  }

  try {
    // Resolving a complaint is a management action (SCRUM-59); the use case repeats the rule for the
    // role it is given, so the caller is still checked there as well.
    const caller = await requireCapability("attendance:review");

    if (!caller.ok) {
      return caller.response;
    }

    const resolveComplaint = new ResolveAttendanceComplaintUseCase(
      new SupabaseAttendanceRepository(),
      new SupabaseBranchRepository(),
    );
    const record = await resolveComplaint.execute({
      attendanceId: id,
      resolverId: caller.userId,
      resolverRole: caller.role,
    });

    return NextResponse.json(record);
  } catch (error) {
    if (error instanceof AttendanceNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof AttendanceComplaintForbiddenError) {
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
      error.message.startsWith("This attendance record has no complaint")
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to resolve attendance complaint", error);
    return NextResponse.json(
      { error: "Unable to resolve the complaint." },
      { status: 500 },
    );
  }
}