/**
 * @swagger
 * /api/payroll/reconciliation:
 *   get:
 *     summary: Đối soát lương của một tháng
 *     description: |
 *       Con số đang lưu đặt cạnh con số tính lại từ bằng chứng (SCRUM-99). Chỉ chủ sở hữu tổ chức
 *       (`payroll:manage`); `payroll_reconcile` gọi chính `payroll_work_lines()` nên vế "tính lại" không thể
 *       lệch với thứ `generate_payslips` sẽ ghi, và endpoint này **không ghi gì**.
 *
 *       Mỗi dòng mang `flags`: `STALE` (phiếu nháp đã lệch số), `MISSING_PAYSLIP` (có giờ công mà chưa có
 *       phiếu), `PUBLISHED` (tiền đã trả — không sửa), `WOULD_REMOVE` (tháng không còn ca nào nên bộ sinh
 *       phiếu sẽ xoá phiếu nháp), `NO_RATE`, `NO_ATTENDANCE`, `OPEN_SHIFT` (ca được tính tới giờ tan ca,
 *       SCRUM-94), `MANUAL_ITEMS`, `ADJUSTMENT` (khoản chốt lương thực nhận, SCRUM-93).
 *
 *       `delta` = `computed_net − stored_net`. `summary.delta_total` chỉ cộng những dòng mà một lần đồng bộ
 *       thật sự sẽ sửa.
 *     tags:
 *       - Payroll
 *     parameters:
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: string
 *           example: "2026-10"
 *         description: Tháng cần đối soát (YYYY-MM).
 *     responses:
 *       200:
 *         description: The month, row by row.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [period_start, rows, summary]
 *               properties:
 *                 period_start:
 *                   type: string
 *                   format: date
 *                 rows:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PayrollReconciliationRow'
 *                 summary:
 *                   type: object
 *                   required: [rows, needs_sync, delta_total]
 *                   properties:
 *                     rows:
 *                       type: integer
 *                     needs_sync:
 *                       type: integer
 *                     delta_total:
 *                       type: integer
 *                     missing_payslips:
 *                       type: integer
 *                     stale:
 *                       type: integer
 *                     missing_rates:
 *                       type: integer
 *                     open_shifts:
 *                       type: integer
 *                     adjustments:
 *                       type: integer
 *       400:
 *         description: month không phải YYYY-MM.
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
 *         description: Chỉ chủ sở hữu tổ chức mới được quản lý bảng lương.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Không tải được dữ liệu đối soát (thường là chưa chạy `SCRUM-99_payroll_reconciliation.sql`).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse, type NextRequest } from "next/server";

import { SupabasePayrollRepository } from "@/lib/infrastructure/repositories/SupabasePayrollRepository";
import { ReconcilePayrollUseCase } from "@/lib/usecases/ReconcilePayrollUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  payrollBadRequest,
  payrollErrorResponse,
} from "@/app/api/payroll/_lib/payrollErrorResponse";
import { parsePayrollPeriod } from "@/app/api/payroll/_lib/payrollRequest";

export async function GET(request: NextRequest) {
  const caller = await requireCapability("payroll:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const period = parsePayrollPeriod(request.nextUrl.searchParams.get("month"));

  if (!period.ok) {
    return payrollBadRequest(period.error);
  }

  try {
    const reconciliation = await new ReconcilePayrollUseCase(
      new SupabasePayrollRepository(),
    ).execute({ periodStart: period.value });

    return NextResponse.json(reconciliation);
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to reconcile the payroll",
      "Không tải được dữ liệu đối soát.",
    );
  }
}
