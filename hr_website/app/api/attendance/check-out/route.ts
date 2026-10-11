/**
 * @swagger
 * /api/attendance/check-out:
 *   post:
 *     summary: Clock out
 *     description: |
 *       Closes one of the signed-in account's own records for the current business day (SCRUM-68):
 *       `check_out_at`, the GPS point of the departure and the resulting status — `EARLY_LEAVE` when the
 *       ca's end time has not been reached, otherwise the status the check-in already carried (a late
 *       arrival is not erased by leaving on time).
 *
 *       Only today's own rows are considered. Without `attendance_id` the single open record is closed;
 *       when more than one ca is still open the request must name the row (`409`/`400` rather than
 *       closing whichever came back first). The check-in facts are never touched — a wrong time is the
 *       manager's correction on `PATCH /api/attendance/{id}`, which records who fixed it and why.
 *
 *       Like the check-in, the organization's `OWNER` is refused (`403`, SCRUM-68).
 *     tags:
 *       - Attendance
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               attendance_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: The record to close, when the caller has more than one ca open today.
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
 *     responses:
 *       200:
 *         description: The closed attendance record.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Attendance'
 *       400:
 *         description: The JSON body is invalid, or more than one ca is open and no `attendance_id` was sent.
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
 *         description: The caller is the organization's owner (SCRUM-68).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No check-in was found for this business day, or the named record is not the caller's own.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: The named record has already been checked out.
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
import { parseCheckOutRequest } from "@/app/api/attendance/_lib/checkRequest";
import { AttendanceAlreadyCheckedOutError } from "@/lib/domain/errors/AttendanceAlreadyCheckedOutError";
import { AttendanceCheckInForbiddenError } from "@/lib/domain/errors/AttendanceCheckInForbiddenError";
import { AttendanceCheckOutAmbiguousError } from "@/lib/domain/errors/AttendanceCheckOutAmbiguousError";
import { AttendanceNotFoundError } from "@/lib/domain/errors/AttendanceNotFoundError";
import { AttendanceNotCheckedInError } from "@/lib/domain/errors/AttendanceNotCheckedInError";
import { SupabaseAttendanceRepository } from "@/lib/infrastructure/repositories/SupabaseAttendanceRepository";
import { RecordCheckOutUseCase } from "@/lib/usecases/RecordCheckOutUseCase";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseCheckOutRequest(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    // The same capability as the check-in, and for the same reason: the owner does not clock in or out.
    const caller = await requireCapability("attendance:checkin");

    if (!caller.ok) {
      return caller.response;
    }

    const recordCheckOut = new RecordCheckOutUseCase(
      new SupabaseAttendanceRepository(),
    );

    const record = await recordCheckOut.execute({
      callerId: caller.userId,
      callerRole: caller.role,
      attendanceId: parsed.input.attendanceId,
      latitude: parsed.input.latitude,
      longitude: parsed.input.longitude,
    });

    return NextResponse.json(record);
  } catch (error) {
    if (error instanceof AttendanceCheckInForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (
      error instanceof AttendanceNotCheckedInError ||
      error instanceof AttendanceNotFoundError
    ) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof AttendanceAlreadyCheckedOutError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof AttendanceCheckOutAmbiguousError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to record check-out", error);
    return NextResponse.json(
      { error: "Unable to record the check-out." },
      { status: 500 },
    );
  }
}
