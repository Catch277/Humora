/**
 * @swagger
 * /api/attendance:
 *   get:
 *     summary: List attendance records
 *     description: |
 *       The Bảng công timesheet (SCRUM-21/22/29). Each row embeds the employee name, the branch
 *       (with its GPS centre and allowed radius, so the screen can judge the geofence) and the
 *       shift hours.
 *
 *       Rows are written by two clients since SCRUM-68: `POST /api/attendance/check-in` /
 *       `check-out` on the web (GPS point, no photo) and the mobile app, which also captures the
 *       check-in photo. Reviewing, correcting and verifying stay a web task.
 *     tags:
 *       - Attendance
 *     parameters:
 *       - in: query
 *         name: branch_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: employee_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ON_TIME, LATE, EARLY_LEAVE, ABSENT, INCOMPLETE]
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Inclusive lower bound on `work_date`.
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Inclusive upper bound on `work_date`.
 *     responses:
 *       200:
 *         description: The attendance records, most recent work date first.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Attendance'
 *       400:
 *         description: A filter is not a UUID, not a calendar date, or not a known status.
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
 *       500:
 *         description: An unexpected server error occurred.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse, type NextRequest } from "next/server";

import { ATTENDANCE_STATUSES } from "@/lib/domain/entities/Attendance";
import { SupabaseAttendanceRepository } from "@/lib/infrastructure/repositories/SupabaseAttendanceRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";
import { ListAttendanceUseCase } from "@/lib/usecases/ListAttendanceUseCase";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_SET: ReadonlySet<string> = new Set(ATTENDANCE_STATUSES);

/** Round-trips the calendar date so `2026-02-31` is rejected instead of rolling into March. */
function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const branchId = params.get("branch_id") ?? undefined;
  const employeeId = params.get("employee_id") ?? undefined;
  const status = params.get("status") ?? undefined;
  const startDate = params.get("start_date") ?? undefined;
  const endDate = params.get("end_date") ?? undefined;

  if (branchId && !UUID_PATTERN.test(branchId)) {
    return NextResponse.json(
      { error: "branch_id phải là UUID." },
      { status: 400 },
    );
  }

  if (employeeId && !UUID_PATTERN.test(employeeId)) {
    return NextResponse.json(
      { error: "employee_id phải là UUID." },
      { status: 400 },
    );
  }

  if (status && !STATUS_SET.has(status)) {
    return NextResponse.json(
      { error: `status phải là một trong: ${ATTENDANCE_STATUSES.join(", ")}.` },
      { status: 400 },
    );
  }

  if (startDate && !isCalendarDate(startDate)) {
    return NextResponse.json(
      { error: "start_date phải là ngày dạng YYYY-MM-DD." },
      { status: 400 },
    );
  }

  if (endDate && !isCalendarDate(endDate)) {
    return NextResponse.json(
      { error: "end_date phải là ngày dạng YYYY-MM-DD." },
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
        { error: "Bạn cần đăng nhập để thực hiện thao tác này." },
        { status: 401 },
      );
    }

    const listAttendance = new ListAttendanceUseCase(
      new SupabaseAttendanceRepository(),
    );
    const records = await listAttendance.execute({
      branchId,
      employeeId,
      status,
      startDate,
      endDate,
    });

    return NextResponse.json(records);
  } catch (error) {
    console.error("Failed to list attendance", error);
    return NextResponse.json(
      { error: "Không thể tải bảng công." },
      { status: 500 },
    );
  }
}