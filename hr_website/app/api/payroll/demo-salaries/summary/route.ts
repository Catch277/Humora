/**
 * @swagger
 * /api/payroll/demo-salaries/summary:
 *   get:
 *     summary: Số liệu theo dõi lương thử việc
 *     description: |
 *       Tổng hợp cho tab "Lương thử việc" (SCRUM-100): số dòng theo trạng thái và tổng gross/net của những
 *       dòng **đang hiệu lực** (`ACTIVE`), kèm bảng theo vị trí. Tổng do `demo_pay_summary` cộng trong SQL, nên
 *       con số trên KPI và con số trên bảng danh sách không thể lệch nhau.
 *
 *       Chỉ chủ sở hữu tổ chức (`payroll:manage`). Đây là tiền mô phỏng — không dòng nào ở đây được tính vào
 *       KPI "Thực nhận" của phiếu lương thật, và màn hình nói rõ điều đó bằng nhãn DEMO.
 *     tags:
 *       - Payroll
 *     responses:
 *       200:
 *         description: The monitoring figure.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [active_records, archived_records, gross_total, net_total, positions]
 *               properties:
 *                 active_records:
 *                   type: integer
 *                 archived_records:
 *                   type: integer
 *                 gross_total:
 *                   type: integer
 *                   description: Tổng gross của các dòng ACTIVE.
 *                 net_total:
 *                   type: integer
 *                   description: Tổng net của các dòng ACTIVE.
 *                 positions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required: [position_code, position_title, records, gross_total, net_total]
 *                     properties:
 *                       position_code:
 *                         type: string
 *                       position_title:
 *                         type: string
 *                       records:
 *                         type: integer
 *                       gross_total:
 *                         type: integer
 *                       net_total:
 *                         type: integer
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới được quản lý bảng lương.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Không tải được số liệu lương thử việc.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse } from "next/server";

import { SupabaseDemoPaySalaryRepository } from "@/lib/infrastructure/repositories/SupabaseDemoPaySalaryRepository";
import { GetDemoPaySummaryUseCase } from "@/lib/usecases/GetDemoPaySummaryUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import { payrollErrorResponse } from "@/app/api/payroll/_lib/payrollErrorResponse";

export async function GET() {
  const caller = await requireCapability("payroll:manage");

  if (!caller.ok) {
    return caller.response;
  }

  try {
    const summary = await new GetDemoPaySummaryUseCase(
      new SupabaseDemoPaySalaryRepository(),
    ).execute();

    return NextResponse.json(summary);
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to load the demo salary summary",
      "Không tải được số liệu lương thử việc.",
    );
  }
}
