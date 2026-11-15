/**
 * @swagger
 * /api/contracts/{id}/renew:
 *   post:
 *     summary: Renew a contract
 *     description: |
 *       Gia hạn bằng cách tạo một **hợp đồng mới** trỏ về hợp đồng cũ (`renews_contract_id`). Hợp đồng cũ
 *       không bị sửa và tự đọc thành `EXPIRED` khi hết ngày. `startDate` phải sau `end_date` của hợp đồng cũ.
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
 *             $ref: '#/components/schemas/ContractRenewInput'
 *     responses:
 *       201:
 *         description: Hợp đồng gia hạn đã được tạo.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Contract'
 *       400:
 *         description: Ngày bắt đầu không sau ngày kết thúc của hợp đồng cũ, hoặc một trường không hợp lệ.
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới quản lý được hợp đồng.
 *       404:
 *         description: Không tìm thấy hợp đồng cần gia hạn.
 *       409:
 *         description: Số hợp đồng mới bị trùng.
 *       500:
 *         description: Không gia hạn được hợp đồng.
 */
import { NextResponse } from "next/server";

import { requireCapability } from "@/app/api/_lib/requireCaller";
import { parseRenewBody } from "@/app/api/_lib/crmBodies";
import { crmBadRequest, crmErrorResponse } from "@/app/api/_lib/crmErrorResponse";
import { readJsonBody, UUID_PATTERN } from "@/app/api/_lib/crmRequest";
import { SupabaseCustomerContractRepository } from "@/lib/infrastructure/repositories/SupabaseCustomerContractRepository";
import { RenewContractUseCase } from "@/lib/usecases/RenewContractUseCase";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
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

  const parsed = parseRenewBody(id, body.value);

  if (!parsed.ok) {
    return crmBadRequest(parsed.error);
  }

  try {
    const contract = await new RenewContractUseCase(
      new SupabaseCustomerContractRepository(),
    ).execute(parsed.value);

    return NextResponse.json(contract, { status: 201 });
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to renew the contract",
      "Không gia hạn được hợp đồng.",
    );
  }
}
