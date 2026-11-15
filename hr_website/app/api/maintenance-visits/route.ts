/**
 * @swagger
 * /api/maintenance-visits:
 *   get:
 *     summary: List maintenance visits
 *     description: |
 *       Lịch sử bảo trì / sửa chữa (SCRUM-102, C5). Trạng thái của mỗi lần là **suy ra**: `DONE` khi có
 *       `completedOn`, `OVERDUE` khi chưa xong mà ngày hẹn đã qua, còn lại là `PLANNED`.
 *     tags:
 *       - Maintenance visits
 *     parameters:
 *       - in: query
 *         name: service_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: customer_id
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Danh sách lần bảo trì.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MaintenanceVisit'
 *       400:
 *         description: Tham số lọc không hợp lệ.
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới xem được lịch bảo trì.
 *       500:
 *         description: Không tải được lịch bảo trì.
 *   post:
 *     summary: Schedule a maintenance visit
 *     description: |
 *       Đặt lịch, hoặc ghi một lần đã làm xong. Một lần đã hoàn tất bắt buộc có `summary` (ít nhất 3 ký tự).
 *       Khách hàng được lấy theo dịch vụ, không theo thân yêu cầu.
 *     tags:
 *       - Maintenance visits
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MaintenanceVisitInput'
 *     responses:
 *       201:
 *         description: Lần bảo trì đã được ghi nhận.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MaintenanceVisit'
 *       400:
 *         description: Một trường không hợp lệ, hoặc thiếu `summary` khi đã hoàn tất.
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới quản lý được lịch bảo trì.
 *       404:
 *         description: Không tìm thấy dịch vụ.
 *       500:
 *         description: Không tạo được lần bảo trì.
 */
import { NextResponse, type NextRequest } from "next/server";

import { requireCapability } from "@/app/api/_lib/requireCaller";
import { parseVisitBody } from "@/app/api/_lib/crmBodies";
import { crmBadRequest, crmErrorResponse } from "@/app/api/_lib/crmErrorResponse";
import { readJsonBody, UUID_PATTERN } from "@/app/api/_lib/crmRequest";
import { SupabaseCustomerServiceRepository } from "@/lib/infrastructure/repositories/SupabaseCustomerServiceRepository";
import { CreateMaintenanceVisitUseCase } from "@/lib/usecases/CreateMaintenanceVisitUseCase";
import { ListMaintenanceVisitsUseCase } from "@/lib/usecases/ListMaintenanceVisitsUseCase";

export async function GET(request: NextRequest) {
  const caller = await requireCapability("maintenance:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const params = request.nextUrl.searchParams;
  const serviceId = params.get("service_id");
  const customerId = params.get("customer_id");

  if (serviceId !== null && !UUID_PATTERN.test(serviceId)) {
    return crmBadRequest("service_id phải là UUID.");
  }

  if (customerId !== null && !UUID_PATTERN.test(customerId)) {
    return crmBadRequest("customer_id phải là UUID.");
  }

  try {
    const visits = await new ListMaintenanceVisitsUseCase(
      new SupabaseCustomerServiceRepository(),
    ).execute({
      serviceId: serviceId ?? undefined,
      customerId: customerId ?? undefined,
    });

    return NextResponse.json(visits);
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to list the maintenance visits",
      "Không tải được lịch bảo trì.",
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

  const parsed = parseVisitBody(body.value);

  if (!parsed.ok) {
    return crmBadRequest(parsed.error);
  }

  try {
    const visit = await new CreateMaintenanceVisitUseCase(
      new SupabaseCustomerServiceRepository(),
    ).execute(parsed.value);

    return NextResponse.json(visit, { status: 201 });
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to create the maintenance visit",
      "Không tạo được lần bảo trì.",
    );
  }
}
