/**
 * @swagger
 * /api/employee-status:
 *   get:
 *     summary: Get the live employee status of one business day
 *     description: |
 *       One row per person for the day (SCRUM-22), derived from `shift_assignments` and
 *       `attendance` by the `get_employee_status` RPC: đang làm việc, chưa vào ca, nghỉ phép,
 *       đã tan ca, không có ca hôm nay or nghỉ việc. The day defaults to today in Asia/Bangkok.
 *       SCRUM-59: giám sát nhân sự is a management view (`employee-status:view`), so a plain
 *       employee gets `403`; SCRUM-60 narrows the rows `get_employee_status` may return.
 *       SCRUM-63: một quản lý chi nhánh chỉ thấy nhân sự thuộc (các) chi nhánh mình phụ trách —
 *       chủ sở hữu vẫn thấy toàn bộ tổ chức, kể cả tài khoản chưa gán chi nhánh.
 *     tags:
 *       - Employees
 *     parameters:
 *       - in: query
 *         name: branch_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Only the people scheduled to, or checking in at, this branch.
 *       - in: query
 *         name: work_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Business day to report (defaults to today in Asia/Bangkok).
 *     responses:
 *       200:
 *         description: The snapshot and the day it describes.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - updated_at
 *                 - work_date
 *                 - data
 *               properties:
 *                 updated_at:
 *                   type: string
 *                   format: date-time
 *                 work_date:
 *                   type: string
 *                   format: date
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/EmployeeStatus'
 *       400:
 *         description: branch_id is not a UUID, or work_date is not a calendar date.
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
 *         description: The caller has no user profile, or their role may not read the roster (SCRUM-59).
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

import { SupabaseBranchRepository } from "@/lib/infrastructure/repositories/SupabaseBranchRepository";
import { SupabaseEmployeeStatusRepository } from "@/lib/infrastructure/repositories/SupabaseEmployeeStatusRepository";
import { GetEmployeeStatusUseCase } from "@/lib/usecases/GetEmployeeStatusUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
  const workDate = params.get("work_date") ?? undefined;

  if (branchId && !UUID_PATTERN.test(branchId)) {
    return NextResponse.json(
      { error: "branch_id must be a UUID." },
      { status: 400 },
    );
  }

  if (workDate && !isCalendarDate(workDate)) {
    return NextResponse.json(
      { error: "work_date must be a calendar date (YYYY-MM-DD)." },
      { status: 400 },
    );
  }

  try {
    // Giám sát nhân sự is a management view (SCRUM-59): the caller first, RLS second (SCRUM-60).
    const caller = await requireCapability("employee-status:view");

    if (!caller.ok) {
      return caller.response;
    }

    const getEmployeeStatus = new GetEmployeeStatusUseCase(
      new SupabaseEmployeeStatusRepository(),
      new SupabaseBranchRepository(),
    );
    // SCRUM-63: a branch head watches their own branches only, so the caller travels with the filters.
    const snapshot = await getEmployeeStatus.execute(
      { branchId, workDate },
      { userId: caller.userId, role: caller.role },
    );

    // The shape the giám sát screen already polls: `updated_at` + `data`.
    return NextResponse.json({
      updated_at: snapshot.updatedAt,
      work_date: snapshot.workDate,
      data: snapshot.statuses,
    });
  } catch (error) {
    console.error("Failed to load employee status", error);
    return NextResponse.json(
      { error: "Unable to retrieve employee status." },
      { status: 500 },
    );
  }
}