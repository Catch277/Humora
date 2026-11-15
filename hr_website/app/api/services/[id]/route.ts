/**
 * @swagger
 * /api/services/{id}:
 *   put:
 *     summary: Update a sold service
 *     description: Sửa thời hạn bảo hành, chu kỳ bảo trì hoặc trạng thái theo dõi của một dịch vụ (C5).
 *     tags:
 *       - Customer services
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
 *             $ref: '#/components/schemas/CustomerServiceInput'
 *     responses:
 *       200:
 *         description: Dịch vụ đã được cập nhật.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CustomerService'
 *       400:
 *         description: Một trường không hợp lệ.
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới quản lý được bảo hành/bảo trì.
 *       404:
 *         description: Không tìm thấy dịch vụ.
 *       500:
 *         description: Không cập nhật được dịch vụ.
 *   delete:
 *     summary: Delete a sold service
 *     description: Xoá dịch vụ; lịch sử bảo trì của nó bị xoá theo.
 *     tags:
 *       - Customer services
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
 *         description: Chỉ chủ sở hữu tổ chức mới xoá được dịch vụ.
 *       404:
 *         description: Không tìm thấy dịch vụ.
 *       500:
 *         description: Không xoá được dịch vụ.
 */
import { NextResponse } from "next/server";

import { requireCapability } from "@/app/api/_lib/requireCaller";
import { parseServiceBody } from "@/app/api/_lib/crmBodies";
import { crmBadRequest, crmErrorResponse } from "@/app/api/_lib/crmErrorResponse";
import { readJsonBody, UUID_PATTERN } from "@/app/api/_lib/crmRequest";
import { SupabaseCustomerServiceRepository } from "@/lib/infrastructure/repositories/SupabaseCustomerServiceRepository";
import { DeleteCustomerServiceUseCase } from "@/lib/usecases/DeleteCustomerServiceUseCase";
import { UpdateCustomerServiceUseCase } from "@/lib/usecases/UpdateCustomerServiceUseCase";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const caller = await requireCapability("maintenance:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return crmBadRequest("id phải là UUID.");
  }

  const body = await readJsonBody(request);

  if (!body.ok) {
    return crmBadRequest(body.error);
  }

  const parsed = parseServiceBody(body.value);

  if (!parsed.ok) {
    return crmBadRequest(parsed.error);
  }

  try {
    const service = await new UpdateCustomerServiceUseCase(
      new SupabaseCustomerServiceRepository(),
    ).execute({ ...parsed.value, id });

    return NextResponse.json(service);
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to update the customer service",
      "Không cập nhật được dịch vụ.",
    );
  }
}

export async function DELETE(_request: Request, context: Context) {
  const caller = await requireCapability("maintenance:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return crmBadRequest("id phải là UUID.");
  }

  try {
    await new DeleteCustomerServiceUseCase(
      new SupabaseCustomerServiceRepository(),
    ).execute(id);

    return NextResponse.json({ id });
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to delete the customer service",
      "Không xoá được dịch vụ.",
    );
  }
}
