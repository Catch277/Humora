/**
 * @swagger
 * /api/shifts:
 *   get:
 *     summary: List shift templates
 *     description: |
 *       Returns the shift catalogue ("Ca sáng" 08:00–17:00, "Ca chiều", ...) that
 *       `/api/schedules` assigns to employees. `branch_id = null` means the template applies to
 *       every branch. SCRUM-30.
 *
 *       This endpoint used to serve the in-memory mock shift list; the schedule itself now lives
 *       in `public.shift_assignments` behind `/api/schedules`.
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
