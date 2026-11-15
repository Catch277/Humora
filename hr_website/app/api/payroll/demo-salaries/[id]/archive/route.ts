/**
 * @swagger
 * /api/payroll/demo-salaries/{id}/archive:
 *   post:
 *     summary: Ngừng theo dõi một mức lương thử việc
 *     description: |
 *       Đặt `status = 'ARCHIVED'` (SCRUM-100) — lựa chọn ở giữa "sửa" và "xoá": dòng thôi được tính vào tổng
 *       theo dõi của `demo_pay_summary` (chỉ cộng `ACTIVE`) nhưng giữ nguyên các con số, và unique index bỏ qua
 *       dòng `ARCHIVED` nên cặp (vị trí, ngày hiệu lực) đó lại dùng được cho một dòng mới.
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
 *         description: The id of the archived row.
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
 *         description: Không ngừng theo dõi được mức lương thử việc.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse, type NextRequest } from "next/server";

import { SupabaseDemoPaySalaryRepository } from "@/lib/infrastructure/repositories/SupabaseDemoPaySalaryRepository";
import { ArchiveDemoPaySalaryUseCase } from "@/lib/usecases/ArchiveDemoPaySalaryUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  payrollBadRequest,
  payrollErrorResponse,
} from "@/app/api/payroll/_lib/payrollErrorResponse";
import { UUID_PATTERN } from "@/app/api/payroll/_lib/payrollRequest";

export async function POST(
  _request: NextRequest,
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
    await new ArchiveDemoPaySalaryUseCase(
      new SupabaseDemoPaySalaryRepository(),
    ).execute(id);

    return NextResponse.json({ id });
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to archive the demo salary",
      "Không ngừng theo dõi được mức lương thử việc.",
    );
  }
}
