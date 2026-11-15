/**
 * @swagger
 * /api/customers/{id}:
 *   put:
 *     summary: Update a customer
 *     description: Thay toàn bộ hồ sơ khách hàng (C4). Một khách còn hợp đồng không xoá được nhưng luôn sửa được.
 *     tags:
 *       - Customers
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
 *             $ref: '#/components/schemas/CustomerInput'
 *     responses:
 *       200:
 *         description: Hồ sơ đã được cập nhật.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Customer'
 *       400:
 *         description: Một trường không hợp lệ.
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới quản lý được khách hàng.
 *       404:
 *         description: Không tìm thấy khách hàng trong tổ chức.
 *       409:
 *         description: Trùng tên công ty hoặc trùng email liên hệ.
 *       500:
 *         description: Không cập nhật được khách hàng.
 *   delete:
 *     summary: Delete a customer
 *     description: |
 *       Xoá một khách hàng chưa có hợp đồng. `409` khi còn hợp đồng — dùng trạng thái `CHURNED` (Đã rời)
 *       để lưu lịch sử thay vì xoá.
 *     tags:
 *       - Customers
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Đã xoá.
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới quản lý được khách hàng.
 *       404:
 *         description: Không tìm thấy khách hàng.
 *       409:
 *         description: Khách hàng còn hợp đồng nên không xoá được.
 *       500:
 *         description: Không xoá được khách hàng.
 */
import { NextResponse } from "next/server";

import { requireCapability } from "@/app/api/_lib/requireCaller";
import { parseCustomerSaveBody } from "@/app/api/_lib/crmBodies";
import { crmBadRequest, crmErrorResponse } from "@/app/api/_lib/crmErrorResponse";
import { readJsonBody, UUID_PATTERN } from "@/app/api/_lib/crmRequest";
import { SupabaseCustomerRepository } from "@/lib/infrastructure/repositories/SupabaseCustomerRepository";
import { DeleteCustomerUseCase } from "@/lib/usecases/DeleteCustomerUseCase";
import { UpdateCustomerUseCase } from "@/lib/usecases/UpdateCustomerUseCase";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const caller = await requireCapability("customer:manage");

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

  const parsed = parseCustomerSaveBody(body.value);

  if (!parsed.ok) {
    return crmBadRequest(parsed.error);
  }

  try {
    const customer = await new UpdateCustomerUseCase(
      new SupabaseCustomerRepository(),
    ).execute(id, parsed.value);

    return NextResponse.json(customer);
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to update the customer",
      "Không cập nhật được khách hàng.",
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
    await new DeleteCustomerUseCase(new SupabaseCustomerRepository()).execute(id);

    return NextResponse.json({ id });
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to delete the customer",
      "Không xoá được khách hàng.",
    );
  }
}
