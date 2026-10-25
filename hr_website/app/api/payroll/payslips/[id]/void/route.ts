/**
 * @swagger
 * /api/payroll/payslips/{id}/void:
 *   post:
 *     summary: Void a payslip with a reason
 *     description: |
 *       Huỷ một phiếu lương nháp hoặc đã phát hành (SCRUM-90). Chỉ chủ sở hữu tổ chức.
 *
 *       Đây là cách duy nhất để sửa một phiếu đã phát hành: số tiền của nó bị đóng băng, nên chủ sở hữu huỷ
 *       (lý do được lưu vào `payroll_audit_log` cùng người thao tác) rồi tạo lại tháng đó. Nhân viên không
 *       còn thấy phiếu đã huỷ (`payslips_select` chỉ mở `PUBLISHED`), và một phiếu `VOID` không bao giờ
 *       quay lại trạng thái khác.
 *     tags:
 *       - Payroll
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 example: Nhập sai đơn giá giờ của ca tối
 *                 description: 5-300 ký tự.
 *     responses:
 *       200:
 *         description: The payslip is void.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [id, status]
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 status:
 *                   type: string
 *                   enum: [VOID]
 *       400:
 *         description: id không phải UUID, hoặc reason quá ngắn/quá dài.
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
 *       404:
 *         description: Không tìm thấy phiếu lương.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Phiếu đã ở trạng thái không thể huỷ.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Không thể huỷ phiếu lương.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse, type NextRequest } from "next/server";

import { SupabasePayrollRepository } from "@/lib/infrastructure/repositories/SupabasePayrollRepository";
import { VoidPayslipUseCase } from "@/lib/usecases/VoidPayslipUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  payrollBadRequest,
  payrollErrorResponse,
} from "@/app/api/payroll/_lib/payrollErrorResponse";
import {
  UUID_PATTERN,
  parseVoidBody,
  readJsonBody,
} from "@/app/api/payroll/_lib/payrollRequest";

export async function POST(
  request: NextRequest,
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

  const body = await readJsonBody(request);

  if (!body.ok) {
    return payrollBadRequest(body.error);
  }

  const reason = parseVoidBody(body.value);

  if (!reason.ok) {
    return payrollBadRequest(reason.error);
  }

  try {
    await new VoidPayslipUseCase(new SupabasePayrollRepository()).execute({
      payslipId: id,
      reason: reason.value,
    });

    return NextResponse.json({ id, status: "VOID" });
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to void the payslip",
      "Không thể huỷ phiếu lương.",
    );
  }
}
