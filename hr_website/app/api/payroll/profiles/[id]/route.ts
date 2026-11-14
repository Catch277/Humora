/**
 * @swagger
 * /api/payroll/profiles/{id}:
 *   patch:
 *     summary: Correct one stored hourly rate
 *     description: |
 *       Sửa một đơn giá giờ đã lưu (SCRUM-92). Chỉ chủ sở hữu tổ chức (`payroll:manage`);
 *       `update_pay_profile` đọc tổ chức và người thao tác từ phiên đăng nhập nên một `id` của tổ chức khác
 *       không sửa được gì.
 *
 *       `effectiveFrom` sửa được ở đây — đó chính là trường hợp `PUT` không xử lý nổi: `set_pay_profile`
 *       ghi theo cặp `(employeeId, effectiveFrom)` nên một dòng lỡ lưu sai ngày hiệu lực chỉ sửa được bằng
 *       `PATCH`. Dời ngày sang trùng một dòng khác của cùng nhân viên trả `409` (`PAY_PROFILE_DUPLICATE`).
 *
 *       Không có `employeeId` trong body: một đơn giá thuộc về đúng một người, muốn chuyển người thì xoá rồi
 *       tạo lại, nhờ vậy không ai âm thầm viết lại lịch sử lương của người khác.
 *     tags:
 *       - Payroll
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Id của dòng `pay_profiles`.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [hourlyRate, effectiveFrom]
 *             properties:
 *               hourlyRate:
 *                 type: integer
 *                 description: VND cho một giờ, 0..10.000.000.
 *               effectiveFrom:
 *                 type: string
 *                 format: date
 *                 description: Ngày bắt đầu áp dụng (YYYY-MM-DD).
 *               overtimeMultiplier:
 *                 type: number
 *                 description: Hệ số ca tăng ca, 1..5, tối đa 2 chữ số thập phân (mặc định 1.5).
 *               fixedAllowance:
 *                 type: integer
 *                 description: Phụ cấp cố định mỗi tháng, 0..1.000.000.000 (mặc định 0).
 *               note:
 *                 type: string
 *                 nullable: true
 *                 description: Ghi chú của người nhập (tối đa 500 ký tự).
 *     responses:
 *       200:
 *         description: The corrected rate.
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
 *         description: Một trường không hợp lệ (UUID, số nguyên trong khoảng, ngày, ghi chú quá dài).
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
 *         description: Không tìm thấy đơn giá giờ trong tổ chức.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Nhân viên này đã có một đơn giá bắt đầu từ ngày đó.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Không thể cập nhật đơn giá giờ.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   delete:
 *     summary: Remove one stored hourly rate
 *     description: |
 *       Xoá một đơn giá giờ (SCRUM-92). Chỉ chủ sở hữu tổ chức.
 *
 *       Phiếu lương đã phát hành **không** đổi: số tiền của phiếu là ảnh chụp
 *       (`payslip_work_lines.hourly_rate`). Việc xoá chỉ ảnh hưởng lần tạo phiếu kế tiếp — nếu đó là đơn giá
 *       duy nhất của người này thì `generate_payslips` sẽ bỏ qua họ và màn hình liệt kê họ vào nhóm "chưa có
 *       đơn giá giờ". Dòng bị xoá được ghi vào `payroll_audit_log` trước khi xoá.
 *     tags:
 *       - Payroll
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Id của dòng `pay_profiles`.
 *     responses:
 *       204:
 *         description: The rate is gone.
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
 *         description: Không tìm thấy đơn giá giờ trong tổ chức.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Không thể xoá đơn giá giờ.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse, type NextRequest } from "next/server";

import { SupabasePayrollRepository } from "@/lib/infrastructure/repositories/SupabasePayrollRepository";
import { DeletePayProfileUseCase } from "@/lib/usecases/DeletePayProfileUseCase";
import { UpdatePayProfileUseCase } from "@/lib/usecases/UpdatePayProfileUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  payrollBadRequest,
  payrollErrorResponse,
} from "@/app/api/payroll/_lib/payrollErrorResponse";
import {
  parsePayProfilePatchBody,
  readJsonBody,
  UUID_PATTERN,
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

  // `id` is validated by the parser together with the body: a malformed path and a malformed rate are the
  // same answer to the caller (`400`), and the parser is the one place that already knows the UUID shape.
  const parsed = parsePayProfilePatchBody(id, body.value);

  if (!parsed.ok) {
    return payrollBadRequest(parsed.error);
  }

  try {
    const result = await new UpdatePayProfileUseCase(
      new SupabasePayrollRepository(),
    ).execute(parsed.value);

    return NextResponse.json(result);
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to update the pay profile",
      "Không thể cập nhật đơn giá giờ.",
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
    await new DeletePayProfileUseCase(
      new SupabasePayrollRepository(),
    ).execute(id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to delete the pay profile",
      "Không thể xoá đơn giá giờ.",
    );
  }
}
