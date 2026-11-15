/**
 * @swagger
 * /api/payroll/payslips/{id}/items:
 *   post:
 *     summary: Add a phụ cấp / thưởng / khấu trừ to a DRAFT
 *     description: |
 *       Thêm một khoản mục vào phiếu lương nháp (SCRUM-90). Chỉ chủ sở hữu tổ chức, và chỉ khi phiếu còn
 *       `DRAFT` — phiếu đã phát hành là bản ghi số tiền đã trả nên bị đóng băng.
 *
 *       `kind` quyết định khoản này cộng vào hay trừ ra; `code` là mã ngắn để đối soát (BONUS, MEAL, BHXH,
 *       PIT, ADVANCE…), `label` là câu nhân viên đọc trên phiếu. BHXH/BHYT/BHTN và thuế TNCN cố ý **không**
 *       tự tính (luật thay đổi) — chúng được nhập tay như một khoản `DEDUCTION`.
 *
 *       Tổng của phiếu được `payroll_recalc` tính lại ngay trong cùng transaction, nên response của lần đọc
 *       kế tiếp đã đúng; `PAYSLIP_DEDUCTIONS_EXCEED_GROSS` là `400` khi khấu trừ vượt thu nhập.
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
 *             required: [kind, code, label, amount]
 *             properties:
 *               kind:
 *                 type: string
 *                 enum: [EARNING, DEDUCTION]
 *               code:
 *                 type: string
 *                 example: BONUS
 *                 description: 2-30 ký tự A-Z, 0-9 hoặc dấu gạch dưới (được viết hoa tự động).
 *               label:
 *                 type: string
 *                 example: Thưởng doanh số
 *                 description: 1-80 ký tự.
 *               amount:
 *                 type: integer
 *                 description: VND, 1..1.000.000.000.
 *     responses:
 *       201:
 *         description: The new item id.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [id]
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *       400:
 *         description: Một trường không hợp lệ, hoặc khấu trừ vượt quá thu nhập của phiếu.
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
 *         description: Không tìm thấy phiếu lương nháp cần thêm khoản mục.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Không thể thêm khoản mục.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse, type NextRequest } from "next/server";

import { SupabasePayrollRepository } from "@/lib/infrastructure/repositories/SupabasePayrollRepository";
import { AddPayslipItemUseCase } from "@/lib/usecases/AddPayslipItemUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  payrollBadRequest,
  payrollErrorResponse,
} from "@/app/api/payroll/_lib/payrollErrorResponse";
import {
  UUID_PATTERN,
  parsePayslipItemBody,
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

  const parsed = parsePayslipItemBody(body.value);

  if (!parsed.ok) {
    return payrollBadRequest(parsed.error);
  }

  try {
    const result = await new AddPayslipItemUseCase(
      new SupabasePayrollRepository(),
    ).execute({ payslipId: id, item: parsed.value });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to add the payslip item",
      "Không thể thêm khoản mục vào phiếu lương.",
    );
  }
}
