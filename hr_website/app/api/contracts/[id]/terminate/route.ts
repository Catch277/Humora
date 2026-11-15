/**
 * @swagger
 * /api/contracts/{id}/terminate:
 *   post:
 *     summary: Terminate a contract
 *     description: |
 *       Chấm dứt hợp đồng kèm ngày và lý do (`status = TERMINATED`). Không xoá hàng: hoá đơn, email và lịch
 *       sử bảo trì vẫn còn. Chấm dứt lần hai trả `409` để lý do đầu tiên không bị ghi đè.
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
 *             type: object
 *             required: [terminatedOn, reason]
 *             properties:
 *               terminatedOn:
 *                 type: string
 *                 format: date
 *                 example: '2026-06-30'
 *               reason:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 300
 *     responses:
 *       200:
 *         description: Hợp đồng đã chấm dứt.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Contract'
 *       400:
 *         description: Ngày hoặc lý do không hợp lệ.
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới quản lý được hợp đồng.
 *       404:
 *         description: Không tìm thấy hợp đồng.
 *       409:
 *         description: Hợp đồng đã được chấm dứt trước đó.
 *       500:
 *         description: Không chấm dứt được hợp đồng.
 */
import { NextResponse } from "next/server";

import { requireCapability } from "@/app/api/_lib/requireCaller";
import { parseTerminateBody } from "@/app/api/_lib/crmBodies";
import { crmBadRequest, crmErrorResponse } from "@/app/api/_lib/crmErrorResponse";
import { readJsonBody, UUID_PATTERN } from "@/app/api/_lib/crmRequest";
import { SupabaseCustomerContractRepository } from "@/lib/infrastructure/repositories/SupabaseCustomerContractRepository";
import { TerminateContractUseCase } from "@/lib/usecases/TerminateContractUseCase";

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

  const parsed = parseTerminateBody(body.value);

  if (!parsed.ok) {
    return crmBadRequest(parsed.error);
  }

  try {
    const contract = await new TerminateContractUseCase(
      new SupabaseCustomerContractRepository(),
    ).execute(id, parsed.value.terminatedOn, parsed.value.reason);

    return NextResponse.json(contract);
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to terminate the contract",
      "Không chấm dứt được hợp đồng.",
    );
  }
}
