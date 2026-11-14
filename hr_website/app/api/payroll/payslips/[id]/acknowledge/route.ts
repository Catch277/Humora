/**
 * @swagger
 * /api/payroll/payslips/{id}/acknowledge:
 *   post:
 *     summary: Acknowledge one's own published payslip
 *     description: |
 *       Nhân viên xác nhận "đã xem, đúng số" cho phiếu lương của chính mình (SCRUM-90).
 *
 *       `acknowledge_payslip` chỉ ghi được khi phiếu `PUBLISHED` và `employee_id = auth.uid()`, nên không
 *       có id nào ở đây xác nhận được phiếu của người khác — trường hợp đó trả `404` như mọi phiếu không
 *       tồn tại. Bấm lần thứ hai không đổi dấu thời gian (`coalesce(acknowledged_at, now())`).
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
 *         description: The payslip is acknowledged.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [id, acknowledged]
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 acknowledged:
 *                   type: boolean
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
 *         description: Không tìm thấy phiếu lương đã phát hành của bạn.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Không thể xác nhận phiếu lương.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse } from "next/server";

import { SupabasePayrollRepository } from "@/lib/infrastructure/repositories/SupabasePayrollRepository";
import { AcknowledgePayslipUseCase } from "@/lib/usecases/AcknowledgePayslipUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  payrollBadRequest,
  payrollErrorResponse,
} from "@/app/api/payroll/_lib/payrollErrorResponse";
import { UUID_PATTERN } from "@/app/api/payroll/_lib/payrollRequest";

export async function POST(
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
    await new AcknowledgePayslipUseCase(
      new SupabasePayrollRepository(),
    ).execute(id);

    return NextResponse.json({ id, acknowledged: true });
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to acknowledge the payslip",
      "Không thể xác nhận phiếu lương.",
    );
  }
}
