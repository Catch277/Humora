/**
 * @swagger
 * /api/requests/swap-candidates:
 *   get:
 *     summary: List the colleagues who may take a ca
 *     description: |
 *       Fills the "đồng nghiệp nhận ca" picker of a "Đổi ca" đơn (SCRUM-82): the active `EMPLOYEE`
 *       accounts of the caller's own branch who are free in that ca on that day, never the caller.
 *
 *       The rule is `public.eligible_swap_targets()` — a `security definer` function that reuses
 *       `shift_conflict_reason()`, i.e. exactly the test the approval trigger (`SCRUM-83`) runs before
 *       it moves the assignment. The list and the decision therefore cannot drift, and a ca the caller
 *       does not hold simply answers an empty array.
 *
 *       RLS cannot answer this question: the `shift_assignments` read policy (SCRUM-63) shows an
 *       `EMPLOYEE` only their own rows, so "is this colleague free?" has to be asked in the database.
 *     tags:
 *       - Requests
 *     parameters:
 *       - in: query
 *         name: work_date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày của ca cần nhượng (YYYY-MM-DD).
 *       - in: query
 *         name: shift_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Ca cần nhượng (public.shifts.id).
 *     responses:
 *       200:
 *         description: The colleagues who may take that ca, empty when nobody is free.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SwapCandidate'
 *       400:
 *         description: work_date is missing or not a calendar date, or shift_id is missing or not a UUID.
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
 *         description: The role may not file a request (SCRUM-59 — the organization's OWNER never does).
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

import { isCalendarDate } from "@/app/api/_lib/calendarDate";
import { SupabaseSwapCandidateRepository } from "@/lib/infrastructure/repositories/SupabaseSwapCandidateRepository";
import { ListSwapCandidatesUseCase } from "@/lib/usecases/ListSwapCandidatesUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The picker of a "Đổi ca" đơn feeds a form only `request:create` may submit, so it asks for the same
 * capability — the organization's `OWNER` files no đơn at all (SCRUM-63) and gets its sentence here
 * instead of an unexplained empty list.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const workDate = params.get("work_date");
  const shiftId = params.get("shift_id");

  if (!workDate || !isCalendarDate(workDate)) {
    return NextResponse.json(
      { error: "work_date là bắt buộc và phải có dạng YYYY-MM-DD." },
      { status: 400 },
    );
  }

  if (!shiftId || !UUID_PATTERN.test(shiftId)) {
    return NextResponse.json(
      { error: "shift_id là bắt buộc và phải là UUID." },
      { status: 400 },
    );
  }

  try {
    const caller = await requireCapability("request:create");

    if (!caller.ok) {
      return caller.response;
    }

    const listCandidates = new ListSwapCandidatesUseCase(
      new SupabaseSwapCandidateRepository(),
    );
    const candidates = await listCandidates.execute({ workDate, shiftId });

    return NextResponse.json(candidates);
  } catch (error) {
    console.error("Failed to list swap candidates", error);
    return NextResponse.json(
      { error: "Không thể tải danh sách đồng nghiệp có thể nhận ca." },
      { status: 500 },
    );
  }
}
