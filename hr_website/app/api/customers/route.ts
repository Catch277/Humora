/**
 * @swagger
 * /api/customers:
 *   get:
 *     summary: List customers
 *     description: |
 *       Sổ khách hàng của tổ chức (SCRUM-101, C4). Dữ liệu đọc từ `get_customer_overview()`, nên mỗi dòng
 *       kèm số hợp đồng còn hiệu lực, tổng phí tháng và ngày hết hạn gần nhất. Chỉ chủ sở hữu tổ chức
 *       (`customer:manage`) gọi được; RLS cũng chỉ trả dòng của tổ chức đó.
 *     tags:
 *       - Customers
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PROSPECT, ACTIVE, SUSPENDED, CHURNED]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm theo tên công ty, tên App hoặc email liên hệ.
 *     responses:
 *       200:
 *         description: Danh sách khách hàng.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CustomerOverview'
 *       400:
 *         description: Tham số lọc không hợp lệ.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới quản lý được khách hàng.
 *       500:
 *         description: Không tải được danh sách khách hàng.
 *   post:
 *     summary: Create a customer
 *     description: Thêm một khách hàng (C4) — tên công ty, tên App đăng ký, người liên hệ và trạng thái.
 *     tags:
 *       - Customers
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CustomerInput'
 *     responses:
 *       201:
 *         description: Khách hàng đã được tạo.
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
 *       409:
 *         description: Trùng tên công ty hoặc trùng email liên hệ.
 *       500:
 *         description: Không thêm được khách hàng.
 */
import { NextResponse, type NextRequest } from "next/server";

import { requireCapability } from "@/app/api/_lib/requireCaller";
import { parseCustomerBody } from "@/app/api/_lib/crmBodies";
import { crmBadRequest, crmErrorResponse } from "@/app/api/_lib/crmErrorResponse";
import { readJsonBody } from "@/app/api/_lib/crmRequest";
import { isCustomerStatus } from "@/lib/domain/entities/Customer";
import { SupabaseCustomerRepository } from "@/lib/infrastructure/repositories/SupabaseCustomerRepository";
import { CreateCustomerUseCase } from "@/lib/usecases/CreateCustomerUseCase";
import { ListCustomersUseCase } from "@/lib/usecases/ListCustomersUseCase";

export async function GET(request: NextRequest) {
  const caller = await requireCapability("customer:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const params = request.nextUrl.searchParams;
  const status = params.get("status");

  if (status !== null && !isCustomerStatus(status)) {
    return crmBadRequest(
      "status phải là PROSPECT, ACTIVE, SUSPENDED hoặc CHURNED.",
    );
  }

  try {
    const customers = await new ListCustomersUseCase(
      new SupabaseCustomerRepository(),
    ).execute({
      status: isCustomerStatus(status) ? status : undefined,
      search: params.get("search") ?? undefined,
    });

    return NextResponse.json(customers);
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to list the customers",
      "Không tải được danh sách khách hàng.",
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

  const parsed = parseCustomerBody(body.value);

  if (!parsed.ok) {
    return crmBadRequest(parsed.error);
  }

  try {
    const customer = await new CreateCustomerUseCase(
      new SupabaseCustomerRepository(),
    ).execute(parsed.value);

    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to create the customer",
      "Không thêm được khách hàng.",
    );
  }
}
