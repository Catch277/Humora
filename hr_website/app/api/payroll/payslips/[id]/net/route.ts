/**
 * @swagger
 * /api/payroll/payslips/{id}/net:
 *   post:
 *     summary: Set the exact final salary of a DRAFT payslip
 *     description: |
 *       Chốt lương thực nhận của **một** phiếu lương nháp (SCRUM-93): nhập đúng số tiền nhân viên sẽ nhận trong
 *       tháng, hệ thống lưu phần chênh lệch so với lương theo giờ công thành **một** khoản mục `ADJUSTMENT`
 *       (`EARNING` nếu cao hơn, `DEDUCTION` nếu thấp hơn) rồi tính lại tổng.
 *
 *       Nhờ vậy phiếu vẫn giữ nguyên phép tính của nó — `gross = work + other_earnings`,
 *       `net = gross − deduction` — và nhân viên đọc được vì sao con số khác với giờ công. Gọi lại API này sẽ
 *       **thay** khoản điều chỉnh cũ chứ không cộng dồn, nên ô nhập hành xử như một trường, không phải một nút
 *       thêm tiền.
 *
 *       Chỉ chủ sở hữu tổ chức (`payroll:manage`) và chỉ với phiếu `DRAFT`: phiếu đã phát hành là bản ghi số
 *       tiền đã trả nên trả `409`, muốn sửa thì huỷ phiếu rồi tạo lại. Tạo lại phiếu của tháng cũng xoá khoản
 *       điều chỉnh này, vì nó được tính trên số giờ công vừa thay đổi.
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
 *             required: [targetNet]
 *             properties:
 *               targetNet:
 *                 type: integer
 *                 description: Số tiền thực nhận mong muốn, VND, 0..1.000.000.000.
 *               note:
 *                 type: string
 *                 nullable: true
 *                 description: Ghi chú của người chốt lương (tối đa 500 ký tự), lưu vào nhật ký thao tác.
 *     responses:
 *       200:
 *         description: The figure the payslip now carries.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [net_amount]
 *               properties:
 *                 net_amount:
 *                   type: integer
 *                   description: "`payslips.net_amount` sau khi tính lại, bằng `targetNet`."
 *       400:
 *         description: targetNet/note không hợp lệ, hoặc khấu trừ vượt quá thu nhập của phiếu.
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
 *         description: Không tìm thấy phiếu lương trong tổ chức.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Phiếu đã phát hành hoặc đã huỷ nên không sửa được số tiền.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Không thể chốt lương thực nhận.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse, type NextRequest } from "next/server";

import { SupabasePayrollRepository } from "@/lib/infrastructure/repositories/SupabasePayrollRepository";
import { SetPayslipNetUseCase } from "@/lib/usecases/SetPayslipNetUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  payrollBadRequest,
  payrollErrorResponse,
} from "@/app/api/payroll/_lib/payrollErrorResponse";
import {
  parsePayslipNetBody,
  readJsonBody,
  UUID_PATTERN,
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

  const parsed = parsePayslipNetBody(body.value);

  if (!parsed.ok) {
    return payrollBadRequest(parsed.error);
  }

  try {
    const result = await new SetPayslipNetUseCase(
      new SupabasePayrollRepository(),
    ).execute(id, parsed.value);

    return NextResponse.json(result);
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to set the payslip net",
      "Không thể chốt lương thực nhận.",
    );
  }
}
