/**
 * @swagger
 * /api/payroll/payslips/{id}:
 *   get:
 *     summary: One payslip with its work lines and items
 *     description: |
 *       Chi tiết một phiếu lương (SCRUM-90): các ca đã được trả (ngày, ca, số phút, đơn giá, hệ số, thành
 *       tiền) và các khoản mục ngoài giờ (phụ cấp, thưởng, khấu trừ — kèm `source` để màn hình biết khoản
 *       nào do hệ thống sinh ra).
 *
 *       "Không tìm thấy" và "không phải của bạn" trả cùng một câu: phiếu nháp vô hình với nhân viên, phiếu
 *       của tổ chức khác vô hình với mọi người, nên phân biệt hai trường hợp sẽ biến endpoint thành công
 *       cụ dò id.
 *     tags:
 *       - Payroll
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: The payslip and the rows that explain it.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PayslipDetail'
 *       400:
 *         description: id không phải UUID.
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
 *       404:
 *         description: Không tìm thấy phiếu lương.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Không thể tải phiếu lương.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse } from "next/server";

import { SupabasePayrollRepository } from "@/lib/infrastructure/repositories/SupabasePayrollRepository";
import { GetPayslipUseCase } from "@/lib/usecases/GetPayslipUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  payrollBadRequest,
  payrollErrorResponse,
} from "@/app/api/payroll/_lib/payrollErrorResponse";
import { UUID_PATTERN } from "@/app/api/payroll/_lib/payrollRequest";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireCapability("payroll:view");

  if (!caller.ok) {
    return caller.response;
  }

  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return payrollBadRequest("id phải là UUID.");
  }

  try {
    const detail = await new GetPayslipUseCase(
      new SupabasePayrollRepository(),
    ).execute(id);

    return NextResponse.json(detail);
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to load the payslip",
      "Không thể tải phiếu lương.",
    );
  }
}
