/**
 * @swagger
 * /api/emails/{id}:
 *   delete:
 *     summary: Delete a logged e-mail
 *     description: Xoá một dòng nhật ký ghi nhầm. Không có thao tác sửa — ghi lại đúng thay vì chỉnh lịch sử.
 *     tags:
 *       - Customer emails
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Đã xoá.
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới xoá được nhật ký email.
 *       404:
 *         description: Không tìm thấy email.
 *       500:
 *         description: Không xoá được email.
 */
import { NextResponse } from "next/server";

import { requireCapability } from "@/app/api/_lib/requireCaller";
import { crmBadRequest, crmErrorResponse } from "@/app/api/_lib/crmErrorResponse";
import { UUID_PATTERN } from "@/app/api/_lib/crmRequest";
import { SupabaseCustomerContractRepository } from "@/lib/infrastructure/repositories/SupabaseCustomerContractRepository";
import { DeleteCustomerEmailUseCase } from "@/lib/usecases/DeleteCustomerEmailUseCase";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: Context) {
  const caller = await requireCapability("customer:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return crmBadRequest("id phải là UUID.");
  }

  try {
    await new DeleteCustomerEmailUseCase(
      new SupabaseCustomerContractRepository(),
    ).execute(id);

    return NextResponse.json({ id });
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to delete the customer email",
      "Không xoá được email.",
    );
  }
}
