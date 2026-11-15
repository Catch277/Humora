/**
 * @swagger
 * /api/maintenance/summary:
 *   get:
 *     summary: Warranty and maintenance KPIs
 *     description: |
 *       Chỉ số của `/maintenance`: dịch vụ đang theo dõi, đang trong bảo hành, đã hết bảo hành, bảo trì đến
 *       hạn (≤ 14 ngày), quá hạn, và số lần bảo trì đã lên lịch / quá hẹn. `get_maintenance_summary()` tính
 *       theo ngày ở Asia/Bangkok.
 *     tags:
 *       - Reminders
 *     responses:
 *       200:
 *         description: Các chỉ số bảo hành/bảo trì.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MaintenanceSummary'
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới xem được chỉ số bảo hành/bảo trì.
 *       500:
 *         description: Không tải được chỉ số bảo hành/bảo trì.
 */
import { NextResponse } from "next/server";

import { requireCapability } from "@/app/api/_lib/requireCaller";
import { crmErrorResponse } from "@/app/api/_lib/crmErrorResponse";
import { SupabaseCustomerServiceRepository } from "@/lib/infrastructure/repositories/SupabaseCustomerServiceRepository";
import { GetMaintenanceSummaryUseCase } from "@/lib/usecases/GetMaintenanceSummaryUseCase";

export async function GET() {
  const caller = await requireCapability("maintenance:manage");

  if (!caller.ok) {
    return caller.response;
  }

  try {
    const summary = await new GetMaintenanceSummaryUseCase(
      new SupabaseCustomerServiceRepository(),
    ).execute();

    return NextResponse.json(summary);
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to load the maintenance summary",
      "Không tải được chỉ số bảo hành/bảo trì.",
    );
  }
}
