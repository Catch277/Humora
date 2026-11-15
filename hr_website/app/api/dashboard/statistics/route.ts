/**
 * @swagger
 * /api/dashboard/statistics:
 *   get:
 *     summary: Số liệu tổng hợp cho dashboard nhiều biểu đồ (A5/SCRUM-98)
 *     description: |-
 *       Trả về bốn nhóm số liệu của dashboard — doanh thu, chấm công, nhân sự và so sánh theo chi
 *       nhánh — trong cùng một kỳ (ngày / tháng / năm) và cùng một bộ lọc chi nhánh.
 *
 *       Con số được tổng hợp trong cơ sở dữ liệu qua hai hàm `get_dashboard_operations` và
 *       `get_dashboard_workforce` (xem `supabase/sql/SCRUM-98_dashboard_statistics.sql`):
 *
 *       - Doanh thu dùng đúng bộ lọc của `GET /api/revenue/report` (chỉ ca đã chốt,
 *         `close_amount - open_amount`), nên hai màn hình không thể lệch nhau.
 *       - "Vắng" = số dòng chấm công có trạng thái `ABSENT` **cộng** số ca đã tan mà không có dòng
 *         chấm công nào (`no_show`) — cùng quy tắc với màn hình Bảng công.
 *       - Quản lý chi nhánh chỉ thấy các chi nhánh mình phụ trách (SCRUM-63); chủ sở hữu thấy toàn
 *         tổ chức, kể cả nhóm tài khoản chưa gán chi nhánh.
 *
 *       Cần quyền `report:view` (`OWNER` / `MANAGER`).
 *     tags:
 *       - Dashboard
 *     parameters:
 *       - in: query
 *         name: period
 *         required: false
 *         schema:
 *           type: string
 *           enum: [day, month, year]
 *           default: month
 *         description: Kỳ cần đọc — `day` là một ngày làm việc, `month` cả tháng, `year` cả năm (theo Asia/Bangkok).
 *       - in: query
 *         name: date
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *           example: 2026-11-15
 *         description: Ngày neo trong kỳ; bỏ trống là hôm nay theo Asia/Bangkok.
 *       - in: query
 *         name: branch_id
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Chỉ đọc một chi nhánh. Bỏ trống là mọi chi nhánh trong phạm vi người gọi.
 *     responses:
 *       200:
 *         description: Số liệu của kỳ, đã lấp đủ các mốc thời gian bằng 0 khi chưa có dữ liệu.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DashboardStatistics'
 *       400:
 *         description: Tham số không hợp lệ (period, date hoặc branch_id).
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Vai trò không có `report:view`, hoặc chi nhánh không do người gọi phụ trách.
 *       404:
 *         description: Không tìm thấy chi nhánh trong tổ chức của người gọi.
 *       500:
 *         description: Lỗi không mong đợi (thường là chưa chạy `SCRUM-98_dashboard_statistics.sql`).
 */
import { type NextRequest, NextResponse } from "next/server";

import {
  DASHBOARD_PERIODS,
  type DashboardPeriod,
} from "@/lib/domain/entities/DashboardStatistics";
import { BranchForbiddenError } from "@/lib/domain/errors/BranchForbiddenError";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import { SupabaseBranchRepository } from "@/lib/infrastructure/repositories/SupabaseBranchRepository";
import { SupabaseDashboardStatisticsRepository } from "@/lib/infrastructure/repositories/SupabaseDashboardStatisticsRepository";
import { GetDashboardStatisticsUseCase } from "@/lib/usecases/GetDashboardStatisticsUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";

const PERIODS = new Set<DashboardPeriod>(DASHBOARD_PERIODS);
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
  const period = request.nextUrl.searchParams.get("period") ?? "month";
  const date = request.nextUrl.searchParams.get("date") ?? undefined;

  if (
    (branchId && !UUID_PATTERN.test(branchId)) ||
    !PERIODS.has(period as DashboardPeriod) ||
    (date !== undefined && !isValidCalendarDate(date))
  ) {
    return NextResponse.json(
      {
        error:
          "period phải là day, month hoặc year, date phải theo định dạng YYYY-MM-DD và branch_id phải là UUID.",
      },
      { status: 400 },
    );
  }

  try {
    // The dashboard aggregates the organization's operation, so it stays a manager view (SCRUM-59).
    const caller = await requireCapability("report:view");

    if (!caller.ok) {
      return caller.response;
    }

    const getDashboardStatistics = new GetDashboardStatisticsUseCase(
      new SupabaseDashboardStatisticsRepository(),
      new SupabaseBranchRepository(),
    );
    const statistics = await getDashboardStatistics.execute(
      { branchId, period: period as DashboardPeriod, date },
      { userId: caller.userId, role: caller.role },
    );

    return NextResponse.json(statistics);
  } catch (error) {
    if (error instanceof BranchForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof BranchNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    // `parseReportDate` answers a Vietnamese `400` message; anything else is a server failure.
    if (error instanceof Error && error.message.startsWith("Ngày")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to load dashboard statistics", error);
    return NextResponse.json(
      { error: "Không tải được số liệu tổng hợp." },
      { status: 500 },
    );
  }
}
