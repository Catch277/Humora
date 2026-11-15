/**
 * @swagger
 * /api/contracts:
 *   get:
 *     summary: List contracts
 *     description: |
 *       Bảng hợp đồng của tổ chức (SCRUM-101, C4). `expiring` / `expired` là **suy ra** từ `end_date` và
 *       `reminder_days` của từng hợp đồng, nên lọc theo trạng thái hiệu lực vẫn đúng sau khi ngày trôi qua.
 *     tags:
 *       - Contracts
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, ACTIVE, EXPIRING, EXPIRED, TERMINATED]
 *       - in: query
 *         name: customer_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm theo tên công ty, tên App hoặc số hợp đồng.
 *     responses:
 *       200:
 *         description: Danh sách hợp đồng.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ContractOverview'
 *       400:
 *         description: Tham số lọc không hợp lệ.
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới quản lý được hợp đồng.
 *       500:
 *         description: Không tải được danh sách hợp đồng.
 *   post:
 *     summary: Record a closed deal
 *     description: |
 *       Ghi nhận một hợp đồng đã chốt (C4). `monthlyFee` **không** nằm trong thân yêu cầu: phí tháng là cột
 *       sinh trong CSDL (`đơn giá × số nhân viên`, sàn 400.000 ₫), nên khách không thể gửi một con số lệch.
 *     tags:
 *       - Contracts
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ContractInput'
 *     responses:
 *       201:
 *         description: Hợp đồng đã được tạo.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Contract'
 *       400:
 *         description: Một trường không hợp lệ (ngày, số nhân viên, đơn giá).
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới quản lý được hợp đồng.
 *       409:
 *         description: Số hợp đồng này đã tồn tại.
 *       500:
 *         description: Không tạo được hợp đồng.
 */
import { NextResponse, type NextRequest } from "next/server";

import { requireCapability } from "@/app/api/_lib/requireCaller";
import { parseContractBody } from "@/app/api/_lib/crmBodies";
import { crmBadRequest, crmErrorResponse } from "@/app/api/_lib/crmErrorResponse";
import { readJsonBody, UUID_PATTERN } from "@/app/api/_lib/crmRequest";
import { isContractEffectiveStatus } from "@/lib/domain/entities/CustomerContract";
import { SupabaseCustomerContractRepository } from "@/lib/infrastructure/repositories/SupabaseCustomerContractRepository";
import { CreateContractUseCase } from "@/lib/usecases/CreateContractUseCase";
import { ListContractsUseCase } from "@/lib/usecases/ListContractsUseCase";

export async function GET(request: NextRequest) {
  const caller = await requireCapability("customer:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const params = request.nextUrl.searchParams;
  const status = params.get("status");
  const customerId = params.get("customer_id");

  if (status !== null && !isContractEffectiveStatus(status)) {
    return crmBadRequest(
      "status phải là DRAFT, ACTIVE, EXPIRING, EXPIRED hoặc TERMINATED.",
    );
  }

  if (customerId !== null && !UUID_PATTERN.test(customerId)) {
    return crmBadRequest("customer_id phải là UUID.");
  }

  try {
    const contracts = await new ListContractsUseCase(
      new SupabaseCustomerContractRepository(),
    ).execute({
      status: isContractEffectiveStatus(status) ? status : undefined,
      customerId: customerId ?? undefined,
      search: params.get("search") ?? undefined,
    });

    return NextResponse.json(contracts);
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to list the contracts",
      "Không tải được danh sách hợp đồng.",
    );
  }
}

export async function POST(request: NextRequest) {
  const caller = await requireCapability("customer:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const body = await readJsonBody(request);

  if (!body.ok) {
    return crmBadRequest(body.error);
  }

  const parsed = parseContractBody(body.value);

  if (!parsed.ok) {
    return crmBadRequest(parsed.error);
  }

  try {
    const contract = await new CreateContractUseCase(
      new SupabaseCustomerContractRepository(),
    ).execute(parsed.value);

    return NextResponse.json(contract, { status: 201 });
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to create the contract",
      "Không tạo được hợp đồng.",
    );
  }
}
