/**
 * @swagger
 * /api/attendance/complaints:
 *   post:
 *     summary: Record a complaint against an attendance record
 *     description: |
 *       Stores the employee's khiếu nại (SCRUM-29) with the current timestamp. The employee on
 *       the record may raise it themselves, and a manager (OWNER/MANAGER) may raise it for them
 *       (the complaint usually arrives by phone); anyone else is refused with `403`.
 *     tags:
 *       - Attendance
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - attendance_id
 *               - complaint
 *             properties:
 *               attendance_id:
 *                 type: string
 *                 format: uuid
 *               complaint:
 *                 type: string
 *                 maxLength: 500
 *                 example: Máy chấm công không nhận diện được khuôn mặt nên em vào ca muộn 10 phút.
 *     responses:
 *       201:
 *         description: The attendance record with the complaint stored.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Attendance'
 *       400:
 *         description: The JSON body is invalid, or the complaint is empty or too long.
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
 *         description: The caller is neither the employee on the record nor a manager of that branch (SCRUM-61, a manager acts only for the branch they head).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: The attendance record does not exist, or its branch is not visible to the caller.
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
import { SupabaseUserRepository } from "@/lib/infrastructure/repositories/SupabaseUserRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";
import { GetUserUseCase } from "@/lib/usecases/GetUserUseCase";
import { RecordAttendanceComplaintUseCase } from "@/lib/usecases/RecordAttendanceComplaintUseCase";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ComplaintRequest = {
  attendance_id?: unknown;
  complaint?: unknown;
};

export async function POST(request: Request) {
  let body: ComplaintRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof body.attendance_id !== "string" ||
    !UUID_PATTERN.test(body.attendance_id)
  ) {
    return NextResponse.json(
      { error: "attendance_id is required and must be a UUID." },
      { status: 400 },
    );
  }

  if (typeof body.complaint !== "string") {
    return NextResponse.json(
      { error: "complaint must be a string." },
      { status: 400 },
    );
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 },
      );
    }

    const getUser = new GetUserUseCase(new SupabaseUserRepository());
    const profile = await getUser.execute(user.id);

    if (!profile) {
      return NextResponse.json(
        { error: "The account has no user profile." },
        { status: 403 },
      );
    }

    const recordComplaint = new RecordAttendanceComplaintUseCase(
      new SupabaseAttendanceRepository(),
      new SupabaseBranchRepository(),
    );
    const record = await recordComplaint.execute({
      attendanceId: body.attendance_id,
      complaint: body.complaint,
      callerId: user.id,
      callerRole: profile.role,
    });

    return NextResponse.json(record, { status: 201 });
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

    if (error instanceof Error && error.message.startsWith("complaint must")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to record attendance complaint", error);
    return NextResponse.json(
      { error: "Unable to record the complaint." },
      { status: 500 },
    );
  }
}