/**
 * @swagger
 * /api/maintenance-visits/{id}:
 *   patch:
 *     summary: Complete or reschedule a maintenance visit
 *     description: |
 *       Chỉ ghi các trường được gửi: bỏ trống thì giữ giá trị đã lưu, gửi `null` thì xoá. Hoàn tất một lần
 *       bảo trì cần `completedOn` và một `summary` (đã có hoặc gửi kèm).
 *     tags:
 *       - Maintenance visits
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MaintenanceVisitPatch'
 *     responses:
 *       200:
 *         description: Lần bảo trì đã được cập nhật.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MaintenanceVisit'
 *       400:
 *         description: Một trường không hợp lệ, hoặc hoàn tất mà thiếu nội dung.
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới quản lý được lịch bảo trì.
 *       404:
 *         description: Không tìm thấy lần bảo trì.
 *       500:
 *         description: Không cập nhật được lần bảo trì.
 *   delete:
 *     summary: Delete a maintenance visit
 *     description: Xoá một lần bảo trì ghi nhầm.
 *     tags:
 *       - Maintenance visits
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Đã xoá.
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới xoá được lần bảo trì.
 *       404:
 *         description: Không tìm thấy lần bảo trì.
 *       500:
 *         description: Không xoá được lần bảo trì.
 */
import { NextResponse } from "next/server";

import { requireCapability } from "@/app/api/_lib/requireCaller";
import { parseVisitPatchBody } from "@/app/api/_lib/crmBodies";
import { crmBadRequest, crmErrorResponse } from "@/app/api/_lib/crmErrorResponse";
import { readJsonBody, UUID_PATTERN } from "@/app/api/_lib/crmRequest";
import { SupabaseCustomerServiceRepository } from "@/lib/infrastructure/repositories/SupabaseCustomerServiceRepository";
import { DeleteMaintenanceVisitUseCase } from "@/lib/usecases/DeleteMaintenanceVisitUseCase";
import { UpdateMaintenanceVisitUseCase } from "@/lib/usecases/UpdateMaintenanceVisitUseCase";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const caller = await requireCapability("maintenance:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const { id } = await context.params;
  const body = await readJsonBody(request);

  if (!body.ok) {
    return crmBadRequest(body.error);
  }

  const parsed = parseVisitPatchBody(id, body.value);

  if (!parsed.ok) {
    return crmBadRequest(parsed.error);
  }

  try {
    const visit = await new UpdateMaintenanceVisitUseCase(
      new SupabaseCustomerServiceRepository(),
    ).execute(parsed.value);

    return NextResponse.json(visit);
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to update the maintenance visit",
      "Không cập nhật được lần bảo trì.",
    );
  }
}

export async function DELETE(_request: Request, context: Context) {
  const caller = await requireCapability("maintenance:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return crmBadRequest("id phải là UUID.");
  }

  try {
    await new DeleteMaintenanceVisitUseCase(
      new SupabaseCustomerServiceRepository(),
    ).execute(id);

    return NextResponse.json({ id });
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to delete the maintenance visit",
      "Không xoá được lần bảo trì.",
    );
  }
}
