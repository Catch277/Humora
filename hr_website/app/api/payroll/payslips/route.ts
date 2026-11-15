/**
 * @swagger
 * /api/payroll/payslips:
 *   get:
 *     summary: List the payslips of one month
 *     description: |
 *       Phiếu lương của một tháng (SCRUM-90), sắp theo nhân viên. RLS quyết định phạm vi: chủ sở hữu đọc
 *       toàn bộ tổ chức, quản lý và nhân viên chỉ đọc phiếu **đã phát hành** của chính mình — nên bộ lọc
 *       `employee_id` chỉ thu hẹp kết quả, không mở thêm quyền.
 *
 *       Tên nhân viên và chi nhánh không nằm trong payload: màn hình đã có danh sách nhân sự và chi nhánh,
 *       và một embed vào `users` sẽ hỏng vì bảng `payslips` trỏ tới `users` hai lần.
 *     tags:
 *       - Payroll
 *     parameters:
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: string
 *           example: "2026-10"
 *         description: Tháng cần xem (YYYY-MM, theo giờ Việt Nam).
 *       - in: query
 *         name: employee_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Chỉ lấy phiếu của một nhân viên (chủ sở hữu); người khác nhận danh sách rỗng.
 *     responses:
 *       200:
 *         description: The payslips of that month.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Payslip'
 *       400:
 *         description: month không phải YYYY-MM, hoặc employee_id không phải UUID.
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
 *         description: Vai trò của bạn không được phép làm việc này.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Không thể tải bảng lương.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse, type NextRequest } from "next/server";

import { SupabasePayrollRepository } from "@/lib/infrastructure/repositories/SupabasePayrollRepository";
import { ListPayslipsUseCase } from "@/lib/usecases/ListPayslipsUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  payrollBadRequest,
  payrollErrorResponse,
} from "@/app/api/payroll/_lib/payrollErrorResponse";
import {
  UUID_PATTERN,
  parsePayrollPeriod,
} from "@/app/api/payroll/_lib/payrollRequest";

export async function GET(request: NextRequest) {
  const caller = await requireCapability("payroll:view");

  if (!caller.ok) {
    return caller.response;
  }

  const params = request.nextUrl.searchParams;
  const period = parsePayrollPeriod(params.get("month"));
  const employeeId = params.get("employee_id") ?? undefined;

  if (!period.ok) {
    return payrollBadRequest(period.error);
  }

  if (employeeId && !UUID_PATTERN.test(employeeId)) {
    return payrollBadRequest("employee_id phải là UUID.");
  }

  try {
    const payslips = await new ListPayslipsUseCase(
      new SupabasePayrollRepository(),
    ).execute({ period: period.value, employeeId });

    return NextResponse.json(payslips);
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to list the payslips",
      "Không thể tải bảng lương.",
    );
  }
}
