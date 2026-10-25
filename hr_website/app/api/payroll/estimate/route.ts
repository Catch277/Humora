/**
 * @swagger
 * /api/payroll/estimate:
 *   get:
 *     summary: Mid-month pay estimate of the caller
 *     description: |
 *       "Thu nhập tạm tính" của chính người gọi trong một tháng (SCRUM-90).
 *
 *       Con số được tính bằng đúng hàm mà bộ sinh phiếu lương dùng (`my_pay_estimate` →
 *       `payroll_work_lines`), nên số nhân viên thấy giữa tháng là quy tắc sẽ trả cho họ, không phải một
 *       cách tính thứ hai. Kết quả dừng ở `gross_estimate`: khấu trừ là quyết định của chủ sở hữu và chỉ
 *       tồn tại khi đã có phiếu lương.
 *
 *       `has_pay_profile = false` nghĩa là chưa ai đặt đơn giá giờ cho tài khoản này — màn hình nói rõ
 *       điều đó thay vì hiển thị `0 ₫` như thể không có ngày công nào.
 *     tags:
 *       - Payroll
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *           example: "2026-10"
 *         description: Tháng cần tạm tính (YYYY-MM); bỏ trống thì lấy tháng hiện tại theo giờ Việt Nam.
 *     responses:
 *       200:
 *         description: The estimate of the caller for that month.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PayEstimate'
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
 *         description: Vai trò của bạn không được phép làm việc này.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Không thể tính thu nhập tạm tính.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse, type NextRequest } from "next/server";

import { SupabasePayrollRepository } from "@/lib/infrastructure/repositories/SupabasePayrollRepository";
import { businessMonth } from "@/lib/usecases/payrollPeriod";
import { GetMyPayEstimateUseCase } from "@/lib/usecases/GetMyPayEstimateUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  payrollBadRequest,
  payrollErrorResponse,
} from "@/app/api/payroll/_lib/payrollErrorResponse";
import { parsePayrollPeriod } from "@/app/api/payroll/_lib/payrollRequest";

export async function GET(request: NextRequest) {
  const caller = await requireCapability("payroll:view");

  if (!caller.ok) {
    return caller.response;
  }

  const month = request.nextUrl.searchParams.get("month");
  const period = parsePayrollPeriod(month ?? businessMonth());

  if (!period.ok) {
    return payrollBadRequest(period.error);
  }

  try {
    const estimate = await new GetMyPayEstimateUseCase(
      new SupabasePayrollRepository(),
    ).execute(period.value);

    return NextResponse.json(estimate);
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to load the pay estimate",
      "Không thể tính thu nhập tạm tính.",
    );
  }
}
