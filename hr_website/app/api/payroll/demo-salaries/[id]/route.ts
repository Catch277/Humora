/**
 * @swagger
 * /api/payroll/demo-salaries/{id}:
 *   patch:
 *     summary: Sửa một mức lương thử việc
 *     description: |
 *       Sửa một dòng lương demo đã lưu (SCRUM-100) — **mọi** trường, kể cả `effectiveFrom` và `positionCode`:
 *       một bản mô phỏng không có lịch sử trả lương phía sau nên không cần "xoá rồi tạo lại" như
 *       `pay_profiles`. `gross_amount`/`net_amount` vẫn do SQL tính lại, client không gửi hai cột đó.
 *     tags:
 *       - Payroll
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Id của dòng `demo_pay_salaries`.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DemoPaySalaryInput'
 *     responses:
 *       200:
 *         description: The id of the corrected row.
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
 *         description: Một trường không hợp lệ, vị trí không hợp lệ, hoặc khấu trừ vượt thu nhập.
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
 *         description: Không tìm thấy mức lương thử việc trong tổ chức.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Vị trí này đã có một dòng khác bắt đầu từ ngày đó.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Không sửa được lương thử việc.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   delete:
 *     summary: Xoá một mức lương thử việc
 *     description: |
 *       Xoá hẳn một dòng lương demo (SCRUM-100). Dòng bị xoá được chép vào `payroll_audit_log`
 *       (`DELETE_DEMO_PAY_SALARY`) trước trong cùng transaction, nên "ai đã xoá mức nào" vẫn trả lời được.
 *
 *       Không đụng tới đồng tiền nào của phân hệ thật: bảng demo không có phiếu lương hay ca làm việc.
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
 *       204:
 *         description: Deleted.
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
 *       404:
 *         description: Không tìm thấy mức lương thử việc trong tổ chức.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Không xoá được lương thử việc.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse, type NextRequest } from "next/server";

import { SupabaseDemoPaySalaryRepository } from "@/lib/infrastructure/repositories/SupabaseDemoPaySalaryRepository";
import { DeleteDemoPaySalaryUseCase } from "@/lib/usecases/DeleteDemoPaySalaryUseCase";
import { UpdateDemoPaySalaryUseCase } from "@/lib/usecases/UpdateDemoPaySalaryUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  payrollBadRequest,
  payrollErrorResponse,
} from "@/app/api/payroll/_lib/payrollErrorResponse";
import { parseDemoSalaryPatchBody } from "@/app/api/payroll/_lib/demoSalaryRequest";
import {
  UUID_PATTERN,
  readJsonBody,
} from "@/app/api/payroll/_lib/payrollRequest";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireCapability("payroll:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const { id } = await context.params;
  const body = await readJsonBody(request);

  if (!body.ok) {
    return payrollBadRequest(body.error);
  }

  // The id is validated together with the body: a malformed path and a malformed amount are the same answer.
  const parsed = parseDemoSalaryPatchBody(id, body.value);

  if (!parsed.ok) {
    return payrollBadRequest(parsed.error);
  }

  try {
    const saved = await new UpdateDemoPaySalaryUseCase(
      new SupabaseDemoPaySalaryRepository(),
    ).execute(parsed.value);

    return NextResponse.json({ id: saved });
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to update the demo salary",
      "Không sửa được lương thử việc.",
    );
  }
}

export async function DELETE(
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
    await new DeleteDemoPaySalaryUseCase(
      new SupabaseDemoPaySalaryRepository(),
    ).execute(id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to delete the demo salary",
      "Không xoá được lương thử việc.",
    );
  }
}
