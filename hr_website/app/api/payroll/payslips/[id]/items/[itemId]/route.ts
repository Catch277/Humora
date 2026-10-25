/**
 * @swagger
 * /api/payroll/payslips/{id}/items/{itemId}:
 *   delete:
 *     summary: Remove a MANUAL item from a DRAFT
 *     description: |
 *       Xoá một khoản mục nhập tay khỏi phiếu lương nháp (SCRUM-90). Chỉ chủ sở hữu tổ chức.
 *
 *       Khoản do hệ thống sinh ra (`source = AUTO`, tức phụ cấp cố định) trả `409`: nó là kết quả của quy
 *       tắc và sẽ được sinh lại ở lần tạo phiếu kế tiếp. Phiếu đã phát hành cũng trả `409` — muốn sửa thì
 *       huỷ phiếu rồi sinh lại.
 *     tags:
 *       - Payroll
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: The item is gone.
 *       400:
 *         description: id hoặc itemId không phải UUID.
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
 *         description: Không tìm thấy khoản mục trong phiếu lương.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Khoản mục do hệ thống sinh ra, hoặc phiếu đã phát hành.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Không thể xoá khoản mục.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse } from "next/server";

import { SupabasePayrollRepository } from "@/lib/infrastructure/repositories/SupabasePayrollRepository";
import { RemovePayslipItemUseCase } from "@/lib/usecases/RemovePayslipItemUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  payrollBadRequest,
  payrollErrorResponse,
} from "@/app/api/payroll/_lib/payrollErrorResponse";
import { UUID_PATTERN } from "@/app/api/payroll/_lib/payrollRequest";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  const caller = await requireCapability("payroll:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const { id, itemId } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return payrollBadRequest("id phải là UUID.");
  }

  if (!UUID_PATTERN.test(itemId)) {
    return payrollBadRequest("itemId phải là UUID.");
  }

  try {
    await new RemovePayslipItemUseCase(
      new SupabasePayrollRepository(),
    ).execute({ payslipId: id, itemId });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to remove the payslip item",
      "Không thể xoá khoản mục.",
    );
  }
}
