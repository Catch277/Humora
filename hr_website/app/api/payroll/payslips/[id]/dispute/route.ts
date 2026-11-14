/**
 * @swagger
 * /api/payroll/payslips/{id}/dispute:
 *   post:
 *     summary: Raise a khiếu nại against one's own payslip
 *     description: |
 *       Nhân viên thắc mắc về phiếu lương của chính mình (SCRUM-90).
 *
 *       Khiếu nại **không sửa** con số: nó lưu lại lời giải thích, báo cho chủ sở hữu (`payslip_disputed`)
 *       và khiến phiếu đó bị giữ lại ở lần phát hành kế tiếp (`publish_payslips`) cho tới khi được xử lý.
 *       Chỉ gửi được khi phiếu `PUBLISHED`, là của chính người gọi, và không có khiếu nại nào đang mở.
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
 *             required: [note]
 *             properties:
 *               note:
 *                 type: string
 *                 example: Ngày 12 em vào ca đủ 4 tiếng nhưng phiếu chỉ tính 2 tiếng.
 *                 description: 5-500 ký tự.
 *     responses:
 *       200:
 *         description: The dispute is recorded.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [id, disputed]
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 disputed:
 *                   type: boolean
 *       400:
 *         description: id không phải UUID, hoặc note quá ngắn/quá dài.
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
 *       409:
 *         description: Phiếu không tồn tại với bạn, hoặc đã có khiếu nại đang mở.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Không thể gửi khiếu nại.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse, type NextRequest } from "next/server";

import { SupabasePayrollRepository } from "@/lib/infrastructure/repositories/SupabasePayrollRepository";
import { DisputePayslipUseCase } from "@/lib/usecases/DisputePayslipUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  payrollBadRequest,
  payrollErrorResponse,
} from "@/app/api/payroll/_lib/payrollErrorResponse";
import {
  UUID_PATTERN,
  parseDisputeBody,
  readJsonBody,
} from "@/app/api/payroll/_lib/payrollRequest";

export async function POST(
  request: NextRequest,
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

  const body = await readJsonBody(request);

  if (!body.ok) {
    return payrollBadRequest(body.error);
  }

  const note = parseDisputeBody(body.value);

  if (!note.ok) {
    return payrollBadRequest(note.error);
  }

  try {
    await new DisputePayslipUseCase(new SupabasePayrollRepository()).execute({
      payslipId: id,
      note: note.value,
    });

    return NextResponse.json({ id, disputed: true });
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to dispute the payslip",
      "Không thể gửi khiếu nại phiếu lương.",
    );
  }
}
