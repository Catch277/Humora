/**
 * @swagger
 * /api/leads:
 *   get:
 *     summary: List demo / trial requests
 *     description: |
 *       Hàng đợi yêu cầu demo / dùng thử (SCRUM-101, C3). Đây là *yêu cầu*, không phải khách hàng: chưa có
 *       hợp đồng, chưa tính doanh thu. Lọc ở server theo trạng thái và từ khoá.
 *     tags:
 *       - Customer leads
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [NEW, CONTACTED, DEMO_SCHEDULED, CONVERTED, REJECTED]
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách yêu cầu demo, mới nhất trước.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CustomerLead'
 *       400:
 *         description: Tham số lọc không hợp lệ.
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới xem được yêu cầu demo.
 *       500:
 *         description: Không tải được yêu cầu demo.
 *   post:
 *     summary: Record a demo / trial request
 *     description: Ghi một yêu cầu lấy từ form landing hoặc từ cuộc gọi. Trạng thái mặc định là `NEW`.
 *     tags:
 *       - Customer leads
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CustomerLeadInput'
 *     responses:
 *       201:
 *         description: Yêu cầu đã được ghi nhận.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CustomerLead'
 *       400:
 *         description: Một trường không hợp lệ.
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới ghi được yêu cầu demo.
 *       500:
 *         description: Không ghi được yêu cầu demo.
 */
import { NextResponse, type NextRequest } from "next/server";

import { requireCapability } from "@/app/api/_lib/requireCaller";
import { parseLeadBody } from "@/app/api/_lib/crmBodies";
import { crmBadRequest, crmErrorResponse } from "@/app/api/_lib/crmErrorResponse";
import { readJsonBody } from "@/app/api/_lib/crmRequest";
import { isLeadStatus } from "@/lib/domain/entities/CustomerLead";
import { SupabaseCustomerRepository } from "@/lib/infrastructure/repositories/SupabaseCustomerRepository";
import { CreateCustomerLeadUseCase } from "@/lib/usecases/CreateCustomerLeadUseCase";
import { ListCustomerLeadsUseCase } from "@/lib/usecases/ListCustomerLeadsUseCase";

export async function GET(request: NextRequest) {
  const caller = await requireCapability("customer:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const params = request.nextUrl.searchParams;
  const status = params.get("status");

  if (status !== null && !isLeadStatus(status)) {
    return crmBadRequest(
      "status phải là NEW, CONTACTED, DEMO_SCHEDULED, CONVERTED hoặc REJECTED.",
    );
  }

  try {
    const leads = await new ListCustomerLeadsUseCase(
      new SupabaseCustomerRepository(),
    ).execute({
      status: isLeadStatus(status) ? status : undefined,
      search: params.get("search") ?? undefined,
    });

    return NextResponse.json(leads);
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to list the demo requests",
      "Không tải được yêu cầu demo.",
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

  const parsed = parseLeadBody(body.value);

  if (!parsed.ok) {
    return crmBadRequest(parsed.error);
  }

  try {
    const lead = await new CreateCustomerLeadUseCase(
      new SupabaseCustomerRepository(),
    ).execute(parsed.value);

    return NextResponse.json(lead, { status: 201 });
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to create the demo request",
      "Không ghi được yêu cầu demo.",
    );
  }
}
