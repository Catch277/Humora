/**
 * @swagger
 * /api/contracts/summary:
 *   get:
 *     summary: Contract KPIs
 *     description: |
 *       Chỉ số của `/customers`: số khách, hợp đồng đang hiệu lực, sắp hết hạn, đã hết hạn, MRR và số hợp
 *       đồng tới hạn gia hạn trong 30 ngày. Tính trong `get_contract_summary()` theo ngày ở Asia/Bangkok.
 *     tags:
 *       - Contracts
 *     responses:
 *       200:
 *         description: Các chỉ số hợp đồng.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ContractSummary'
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới xem được chỉ số hợp đồng.
 *       500:
 *         description: Không tải được chỉ số hợp đồng.
 */
import { NextResponse } from "next/server";

import { requireCapability } from "@/app/api/_lib/requireCaller";
import { crmErrorResponse } from "@/app/api/_lib/crmErrorResponse";
import { SupabaseCustomerContractRepository } from "@/lib/infrastructure/repositories/SupabaseCustomerContractRepository";
import { GetContractSummaryUseCase } from "@/lib/usecases/GetContractSummaryUseCase";

export async function GET() {
  const caller = await requireCapability("customer:manage");

  if (!caller.ok) {
    return caller.response;
  }

  try {
    const summary = await new GetContractSummaryUseCase(
      new SupabaseCustomerContractRepository(),
    ).execute();

    return NextResponse.json(summary);
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to load the contract summary",
      "Không tải được chỉ số hợp đồng.",
    );
  }
}
