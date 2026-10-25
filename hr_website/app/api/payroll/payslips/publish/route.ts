/**
 * @swagger
 * /api/payroll/payslips/publish:
 *   post:
 *     summary: Publish every DRAFT of a finished month
 *     description: |
 *       Phát hành phiếu lương của một tháng đã kết thúc (SCRUM-90). Chỉ chủ sở hữu tổ chức.
 *
 *       Phiếu của nhân viên còn khiếu nại bảng công **chưa xử lý** trong tháng đó sẽ bị **giữ lại**
 *       (`held_for_complaints`) chứ không phát hành: một con số đang bị thắc mắc không được công bố như
 *       số cuối cùng. Nhân viên nhận được thông báo `payslip_published` khi phiếu của họ được phát hành
 *       (nếu project đã chạy SCRUM-70).
 *
 *       Đây là bước duy nhất khiến phiếu trở nên bất biến: sau khi phát hành, số tiền và các dòng chi tiết
 *       không sửa được nữa — muốn sửa phải huỷ (`void`) rồi sinh lại.
 *     tags:
 *       - Payroll
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [month]
 *             properties:
 *               month:
 *                 type: string
 *                 example: "2026-09"
 *     responses:
 *       200:
 *         description: How many payslips were published and how many were held.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PublishPayslipsResult'
 *       400:
 *         description: month không hợp lệ, hoặc tháng chưa kết thúc (`PAYROLL_PERIOD_NOT_FINISHED`).
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
 *         description: Không thể phát hành phiếu lương.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse, type NextRequest } from "next/server";

import { SupabasePayrollRepository } from "@/lib/infrastructure/repositories/SupabasePayrollRepository";
import { PublishPayslipsUseCase } from "@/lib/usecases/PublishPayslipsUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  payrollBadRequest,
  payrollErrorResponse,
} from "@/app/api/payroll/_lib/payrollErrorResponse";
import {
  parsePayrollPeriod,
  readJsonBody,
} from "@/app/api/payroll/_lib/payrollRequest";

export async function POST(request: NextRequest) {
  const caller = await requireCapability("payroll:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const body = await readJsonBody(request);

  if (!body.ok) {
    return payrollBadRequest(body.error);
  }

  const period = parsePayrollPeriod(
    typeof body.value.month === "string" ? body.value.month : null,
  );

  if (!period.ok) {
    return payrollBadRequest(period.error);
  }

  try {
    const result = await new PublishPayslipsUseCase(
      new SupabasePayrollRepository(),
    ).execute(period.value);

    return NextResponse.json(result);
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to publish the payslips",
      "Không thể phát hành phiếu lương.",
    );
  }
}
