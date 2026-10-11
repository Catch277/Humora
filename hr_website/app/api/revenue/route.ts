/**
 * @swagger
 * /api/revenue:
 *   get:
 *     summary: List revenue records
 *     description: |
 *       The records behind the Doanh thu screen: one row per branch per business day, newest first,
 *       with the opening amount, the closing amount when the shift was closed and who closed it.
 *       `/api/revenue/report` answers the aggregates; this answers the rows. The window is counted in
 *       Asia/Bangkok business days, and the list is capped at 100 rows.
 *     tags:
 *       - Revenue
 *     parameters:
 *       - in: query
 *         name: branch_id
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Limits the list to one branch. Omit for every accessible branch.
 *       - in: query
 *         name: days
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 31
 *           default: 7
 *         description: How many business days back to include, counting today.
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [open, closed, all]
 *           default: all
 *         description: Only records still open, only closed ones, or both.
 *     responses:
 *       200:
 *         description: The revenue records, newest first.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RevenueRecord'
 *       400:
 *         description: One or more query parameters are invalid.
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
 *       500:
 *         description: An unexpected server error occurred.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { type NextRequest, NextResponse } from "next/server";

import { SupabaseRevenueRepository } from "@/lib/infrastructure/repositories/SupabaseRevenueRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";
import { ListRevenueUseCase } from "@/lib/usecases/ListRevenueUseCase";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** `all` disables the filter, the same convention the request list uses. */
const REVENUE_STATUSES = new Set(["open", "closed", "all"]);

export async function GET(request: NextRequest) {
  const branchId = request.nextUrl.searchParams.get("branch_id") ?? undefined;
  const daysParam = request.nextUrl.searchParams.get("days");
  const status = request.nextUrl.searchParams.get("status") ?? "all";

  if (branchId && !UUID_PATTERN.test(branchId)) {
    return NextResponse.json(
      { error: "branch_id must be a UUID." },
      { status: 400 },
    );
  }

  if (!REVENUE_STATUSES.has(status)) {
    return NextResponse.json(
      { error: "status must be open, closed or all." },
      { status: 400 },
    );
  }

  const days = daysParam === null ? undefined : Number(daysParam);

  if (days !== undefined && !Number.isInteger(days)) {
    return NextResponse.json({ error: "days must be an integer." }, { status: 400 });
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

    const listRevenue = new ListRevenueUseCase(new SupabaseRevenueRepository());
    const records = await listRevenue.execute({
      branchId,
      days,
      isClosed: status === "all" ? undefined : status === "closed",
    });

    return NextResponse.json(records);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("days must")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to list revenue records", error);
    return NextResponse.json(
      { error: "Unable to list revenue records." },
      { status: 500 },
    );
  }
}