/**
 * @swagger
 * /api/services:
 *   get:
 *     summary: List sold services
 *     description: |
 *       Bảo hành và chu kỳ bảo trì của từng dịch vụ đã bán (SCRUM-102, C5). `warrantyEndOn`, `nextDueOn` và
 *       hai trạng thái được tính trong `get_maintenance_overview()` theo ngày ở Asia/Bangkok.
 *     tags:
 *       - Customer services
 *     parameters:
 *       - in: query
 *         name: customer_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: state
 *         schema: { type: string, enum: [NONE, OK, DUE_SOON, OVERDUE] }
 *     responses:
 *       200:
 *         description: Danh sách dịch vụ.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ServiceOverview'
 *       400:
 *         description: Tham số lọc không hợp lệ.
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới xem được bảo hành/bảo trì.
 *       500:
 *         description: Không tải được danh sách dịch vụ.
 *   post:
 *     summary: Record a sold service with warranty
 *     description: |
 *       Ghi nhận dịch vụ/App đã bán. `warrantyEndOn` là cột sinh (`warrantyStartOn + warrantyMonths`) nên
 *       không gửi trong thân yêu cầu; `maintenanceIntervalMonths = 0` nghĩa là không bảo trì định kỳ.
 *     tags:
 *       - Customer services
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CustomerServiceInput'
 *     responses:
 *       201:
 *         description: Dịch vụ đã được ghi nhận.
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
 *       500:
 *         description: Không tạo được dịch vụ.
 */
import { NextResponse, type NextRequest } from "next/server";

import { requireCapability } from "@/app/api/_lib/requireCaller";
import { parseServiceBody } from "@/app/api/_lib/crmBodies";
import { crmBadRequest, crmErrorResponse } from "@/app/api/_lib/crmErrorResponse";
import { readJsonBody, UUID_PATTERN } from "@/app/api/_lib/crmRequest";
import { isMaintenanceState } from "@/lib/domain/entities/CustomerService";
import { SupabaseCustomerServiceRepository } from "@/lib/infrastructure/repositories/SupabaseCustomerServiceRepository";
import { CreateCustomerServiceUseCase } from "@/lib/usecases/CreateCustomerServiceUseCase";
import { ListCustomerServicesUseCase } from "@/lib/usecases/ListCustomerServicesUseCase";

export async function GET(request: NextRequest) {
  const caller = await requireCapability("maintenance:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const params = request.nextUrl.searchParams;
  const state = params.get("state");
  const customerId = params.get("customer_id");

  if (state !== null && !isMaintenanceState(state)) {
    return crmBadRequest("state phải là NONE, OK, DUE_SOON hoặc OVERDUE.");
  }

  if (customerId !== null && !UUID_PATTERN.test(customerId)) {
    return crmBadRequest("customer_id phải là UUID.");
  }

  try {
    const services = await new ListCustomerServicesUseCase(
      new SupabaseCustomerServiceRepository(),
    ).execute({
      state: isMaintenanceState(state) ? state : undefined,
      customerId: customerId ?? undefined,
    });

    return NextResponse.json(services);
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to list the customer services",
      "Không tải được danh sách dịch vụ.",
    );
  }
}

export async function POST(request: NextRequest) {
  const caller = await requireCapability("maintenance:manage");

  if (!caller.ok) {
    return caller.response;
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
    const service = await new CreateCustomerServiceUseCase(
      new SupabaseCustomerServiceRepository(),
    ).execute(parsed.value);

    return NextResponse.json(service, { status: 201 });
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to create the customer service",
      "Không tạo được dịch vụ.",
    );
  }
}
