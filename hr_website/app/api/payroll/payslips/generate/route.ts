/**
 * @swagger
 * /api/payroll/payslips/generate:
 *   post:
 *     summary: Create or refresh the DRAFT payslips of a month
 *     description: |
 *       Sinh phiếu lương nháp cho một tháng (SCRUM-90). Chỉ chủ sở hữu tổ chức. `generate_payslips` tính
 *       giờ từ `attendance.worked_seconds`, cắt theo độ dài ca được xếp, nhân với đơn giá giờ hiệu lực
 *       trong tháng, cộng phụ cấp cố định — tất cả trong một transaction, bằng đúng hàm mà "thu nhập tạm
 *       tính" của nhân viên dùng.
 *
 *       Ai bị bỏ qua và vì sao: tài khoản `OWNER` (không ai trả lương cho chủ sở hữu), người chưa có đơn
 *       giá giờ hiệu lực trong tháng, và người không có ca nào được tính. Phiếu đã phát hành không bị
 *       đụng tới; phiếu nháp được ghi lại từ đầu (các khoản `MANUAL` đã nhập vẫn giữ).
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
 *               employeeId:
 *                 type: string
 *                 format: uuid
 *                 description: Chỉ sinh cho một nhân viên.
 *     responses:
 *       200:
 *         description: How many drafts the month now holds.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [drafts]
 *               properties:
 *                 drafts:
 *                   type: integer
 *       400:
 *         description: month không hợp lệ, hoặc tháng nằm ở tương lai (`PAYROLL_FUTURE_PERIOD`).
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
 *         description: Không thể tạo phiếu lương.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse, type NextRequest } from "next/server";

import { SupabasePayrollRepository } from "@/lib/infrastructure/repositories/SupabasePayrollRepository";
import { GeneratePayslipsUseCase } from "@/lib/usecases/GeneratePayslipsUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  payrollBadRequest,
  payrollErrorResponse,
} from "@/app/api/payroll/_lib/payrollErrorResponse";
import {
  UUID_PATTERN,
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

  const employeeId = body.value.employeeId;

  if (
    employeeId !== undefined &&
    employeeId !== null &&
    (typeof employeeId !== "string" || !UUID_PATTERN.test(employeeId))
  ) {
    return payrollBadRequest("employeeId phải là UUID.");
  }

  try {
    const result = await new GeneratePayslipsUseCase(
      new SupabasePayrollRepository(),
    ).execute({
      periodStart: period.value,
      employeeId: typeof employeeId === "string" ? employeeId : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to generate the payslips",
      "Không thể tạo phiếu lương.",
    );
  }
}
