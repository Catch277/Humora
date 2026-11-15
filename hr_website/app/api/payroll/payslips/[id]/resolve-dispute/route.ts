/**
 * @swagger
 * /api/payroll/payslips/{id}/resolve-dispute:
 *   post:
 *     summary: Mark the employee's khiếu nại as handled
 *     description: |
 *       Đánh dấu khiếu nại của nhân viên trên phiếu lương đã được xử lý (SCRUM-90). Chỉ chủ sở hữu tổ chức.
 *
 *       Thao tác này chỉ ghi `dispute_resolved_at`; nội dung khiếu nại vẫn được giữ để đối soát. Muốn sửa
 *       con số thì phải huỷ phiếu và tạo lại — khiếu nại không bao giờ tự sửa tiền.
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
 *         description: The dispute is marked resolved.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [id, resolved]
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 resolved:
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
 *         description: Chỉ chủ sở hữu tổ chức mới được quản lý bảng lương.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Phiếu này không có khiếu nại nào đang mở.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Không thể xử lý khiếu nại.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse } from "next/server";

import { SupabasePayrollRepository } from "@/lib/infrastructure/repositories/SupabasePayrollRepository";
import { ResolvePayslipDisputeUseCase } from "@/lib/usecases/ResolvePayslipDisputeUseCase";
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
  const caller = await requireCapability("payroll:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return payrollBadRequest("id phải là UUID.");
  }

  try {
    await new ResolvePayslipDisputeUseCase(
      new SupabasePayrollRepository(),
    ).execute(id);

    return NextResponse.json({ id, resolved: true });
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to resolve the payslip dispute",
      "Không thể xử lý khiếu nại phiếu lương.",
    );
  }
}
