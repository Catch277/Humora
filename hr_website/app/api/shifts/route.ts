/**
 * @swagger
 * /api/shifts:
 *   get:
 *     summary: List shift templates
 *     description: |
 *       Returns the **schedulable** shift catalogue — since SCRUM-84/85 that is "Ca sáng" 08:30–12:30,
 *       "Ca chiều" 13:30–17:30 and "Tăng ca" 18:00–22:00 — which `/api/schedules` assigns to employees and
 *       every "Ca làm việc" picker (including the manager's picker on `/check-in`) reads. `branch_id = null`
 *       means the template applies to every branch. SCRUM-30 / SCRUM-84.
 *
 *       Two templates are deliberately absent:
 *       * a retired one (SCRUM-85). The legacy "Ca tối" 14:00–23:00 row is kept — a past assignment or
 *         registration still points at it — but it is no longer offered; a week that already holds one
 *         renders it through the template embedded in that assignment.
 *       * a zero-length one (SCRUM-86). "Nghỉ" 00:00–00:00 is a day off, not a time of day: it can be
 *         neither scheduled nor handed over, and an approved "Nghỉ phép" marks the ca the employee holds
 *         instead of writing a row on it.
 *
 *       The pauses between two working ca ("nghỉ giữa ca") are deliberately not templates: `/schedules`
 *       draws them from the gap between one ca's end and the next ca's start, so no row here can ever
 *       be assigned to an employee.
 *     tags:
 *       - Shifts
 *     responses:
 *       200:
 *         description: The shift catalogue.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Shift'
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
import { NextResponse } from "next/server";

import { SupabaseShiftRepository } from "@/lib/infrastructure/repositories/SupabaseShiftRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";
import { ListShiftsUseCase } from "@/lib/usecases/ListShiftsUseCase";

export async function GET() {
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

    const listShifts = new ListShiftsUseCase(new SupabaseShiftRepository());
    const shifts = await listShifts.execute();

    return NextResponse.json(shifts);
  } catch (error) {
    console.error("Failed to list shifts", error);
    return NextResponse.json(
      { error: "Không thể tải danh mục ca." },
      { status: 500 },
    );
  }
}
