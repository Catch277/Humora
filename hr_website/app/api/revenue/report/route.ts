/**
 * @swagger
 * /api/revenue/report:
 *   get:
 *     summary: Get an aggregated revenue report
 *     description: |-
 *       Reports closed-shift revenue (close_amount minus open_amount) in the Asia/Bangkok business
 *       timezone and compares it with the preceding equivalent period. SCRUM-59: the report aggregates
 *       the organization's operation, so it needs `report:view` — `OWNER` or `MANAGER` only.
 *     tags:
 *       - Revenue
 *     parameters:
 *       - in: query
 *         name: branch_id
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Limits the report to one branch. Omit for all accessible branches.
 *       - in: query
 *         name: period
 *         required: false
 *         schema:
 *           type: string
 *           enum: [day, week, month, quarter, year]
 *           default: day
 *       - in: query
 *         name: date
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *           example: 2026-09-29
 *         description: A date within the requested business period; defaults to today in Asia/Bangkok.
 *     responses:
 *       200:
 *         description: The aggregated report and period-over-period comparison.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RevenueReport'
 *       400:
 *         description: One or more query parameters are invalid.
 *       401:
 *         description: Authentication is required.
 *       403:
 *         description: The caller has no user profile, or their role may not read the report (SCRUM-59).
 *       500:
 *         description: An unexpected server error occurred.
 */
import { type NextRequest, NextResponse } from "next/server";

import type { RevenueReportPeriod } from "@/lib/domain/entities/RevenueReport";
import { SupabaseRevenueReportRepository } from "@/lib/infrastructure/repositories/SupabaseRevenueReportRepository";
import { GetRevenueReportUseCase } from "@/lib/usecases/GetRevenueReportUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";

const REPORT_PERIODS = new Set<RevenueReportPeriod>([
  "day",
  "week",
  "month",
  "quarter",
  "year",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export async function GET(request: NextRequest) {
  const branchId = request.nextUrl.searchParams.get("branch_id") ?? undefined;
  const period = request.nextUrl.searchParams.get("period") ?? "day";
  const date = request.nextUrl.searchParams.get("date") ?? undefined;

  if (
    (branchId && !UUID_PATTERN.test(branchId)) ||
    !REPORT_PERIODS.has(period as RevenueReportPeriod) ||
    (date !== undefined && !isValidCalendarDate(date))
  ) {
    return NextResponse.json(
      {
        error:
          "branch_id must be a UUID, period must be day, week, month, quarter, or year, and date must be YYYY-MM-DD.",
      },
      { status: 400 },
    );
  }

  try {
    // The revenue report aggregates the whole organization, so it stays a manager view (SCRUM-59).
    const caller = await requireCapability("report:view");

    if (!caller.ok) {
      return caller.response;
    }

    const getRevenueReport = new GetRevenueReportUseCase(
      new SupabaseRevenueReportRepository(),
    );
    const report = await getRevenueReport.execute({
      branchId,
      period: period as RevenueReportPeriod,
      date,
    });

    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("date must")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to generate revenue report", error);
    return NextResponse.json(
      { error: "Unable to generate revenue report." },
      { status: 500 },
    );
  }
}
