/**
 * @swagger
 * /api/leads/{id}:
 *   patch:
 *     summary: Move a demo request forward
 *     description: |
 *       Đổi trạng thái (mới / đã liên hệ / hẹn demo / đã chuyển thành khách / từ chối) và ghi chú. Đánh dấu
 *       `CONVERTED` **không** tạo khách hàng: đó là `POST /api/customers`, và id khách được gửi kèm ở đây.
 *     tags:
 *       - Customer leads
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CustomerLeadPatch'
 *     responses:
 *       200:
 *         description: Yêu cầu đã được cập nhật.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CustomerLead'
 *       400:
 *         description: Một trường không hợp lệ.
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới sửa được yêu cầu demo.
 *       404:
 *         description: Không tìm thấy yêu cầu demo.
 *       500:
 *         description: Không cập nhật được yêu cầu demo.
 *   delete:
 *     summary: Delete a demo request
 *     description: Xoá một yêu cầu ghi nhầm.
 *     tags:
 *       - Customer leads
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
 *         description: Chỉ chủ sở hữu tổ chức mới xoá được yêu cầu demo.
 *       404:
 *         description: Không tìm thấy yêu cầu demo.
 *       500:
 *         description: Không xoá được yêu cầu demo.
 */
import { NextResponse } from "next/server";

import { requireCapability } from "@/app/api/_lib/requireCaller";
import { parseLeadPatchBody } from "@/app/api/_lib/crmBodies";
import { crmBadRequest, crmErrorResponse } from "@/app/api/_lib/crmErrorResponse";
import { readJsonBody, UUID_PATTERN } from "@/app/api/_lib/crmRequest";
import { SupabaseCustomerRepository } from "@/lib/infrastructure/repositories/SupabaseCustomerRepository";
import { DeleteCustomerLeadUseCase } from "@/lib/usecases/DeleteCustomerLeadUseCase";
import { UpdateCustomerLeadUseCase } from "@/lib/usecases/UpdateCustomerLeadUseCase";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const caller = await requireCapability("customer:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const { id } = await context.params;
  const body = await readJsonBody(request);

  if (!body.ok) {
    return crmBadRequest(body.error);
  }

  const parsed = parseLeadPatchBody(id, body.value);

  if (!parsed.ok) {
    return crmBadRequest(parsed.error);
  }

  try {
    const lead = await new UpdateCustomerLeadUseCase(
      new SupabaseCustomerRepository(),
    ).execute(id, parsed.value);

    return NextResponse.json(lead);
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to update the demo request",
      "Không cập nhật được yêu cầu demo.",
    );
  }
}

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
    await new DeleteCustomerLeadUseCase(
      new SupabaseCustomerRepository(),
    ).execute(id);

    return NextResponse.json({ id });
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to delete the demo request",
      "Không xoá được yêu cầu demo.",
    );
  }
}
