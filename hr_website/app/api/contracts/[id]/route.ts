/**
 * @swagger
 * /api/contracts/{id}:
 *   put:
 *     summary: Update a contract
 *     description: |
 *       Sửa một hợp đồng chưa chấm dứt (C4). Không sửa được trạng thái ở đây — dùng
 *       `POST /api/contracts/{id}/terminate` để đóng hợp đồng kèm lý do.
 *     tags:
 *       - Contracts
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
 *             $ref: '#/components/schemas/ContractInput'
 *     responses:
 *       200:
 *         description: Hợp đồng đã được cập nhật.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Contract'
 *       400:
 *         description: Một trường không hợp lệ.
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới quản lý được hợp đồng.
 *       404:
 *         description: Không tìm thấy hợp đồng.
 *       409:
 *         description: Hợp đồng đã chấm dứt, hoặc số hợp đồng bị trùng.
 *       500:
 *         description: Không cập nhật được hợp đồng.
 *   delete:
 *     summary: Delete a contract
 *     description: Xoá hợp đồng tạo nhầm. `409` khi hợp đồng đã có email, dịch vụ hoặc lần nhắc — dùng "Chấm dứt".
 *     tags:
 *       - Contracts
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
 *         description: Chỉ chủ sở hữu tổ chức mới quản lý được hợp đồng.
 *       404:
 *         description: Không tìm thấy hợp đồng.
 *       409:
 *         description: Hợp đồng còn dữ liệu nên không xoá được.
 *       500:
 *         description: Không xoá được hợp đồng.
 */
import { NextResponse } from "next/server";

import { requireCapability } from "@/app/api/_lib/requireCaller";
import { parseContractPatchBody } from "@/app/api/_lib/crmBodies";
import { crmBadRequest, crmErrorResponse } from "@/app/api/_lib/crmErrorResponse";
import { readJsonBody, UUID_PATTERN } from "@/app/api/_lib/crmRequest";
import { SupabaseCustomerContractRepository } from "@/lib/infrastructure/repositories/SupabaseCustomerContractRepository";
import { DeleteContractUseCase } from "@/lib/usecases/DeleteContractUseCase";
import { UpdateContractUseCase } from "@/lib/usecases/UpdateContractUseCase";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const caller = await requireCapability("customer:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const { id } = await context.params;
  const body = await readJsonBody(request);

  if (!body.ok) {
    return crmBadRequest(body.error);
  }

  const parsed = parseContractPatchBody(id, body.value);

  if (!parsed.ok) {
    return crmBadRequest(parsed.error);
  }

  try {
    const contract = await new UpdateContractUseCase(
      new SupabaseCustomerContractRepository(),
    ).execute(parsed.value);

    return NextResponse.json(contract);
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to update the contract",
      "Không cập nhật được hợp đồng.",
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
    await new DeleteContractUseCase(
      new SupabaseCustomerContractRepository(),
    ).execute(id);

    return NextResponse.json({ id });
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to delete the contract",
      "Không xoá được hợp đồng.",
    );
  }
}
