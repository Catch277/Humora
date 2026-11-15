/**
 * @swagger
 * /api/reminders:
 *   get:
 *     summary: Reminder queue
 *     description: |
 *       "Việc cần làm" của C5 (SCRUM-102) — **suy ra** từ hợp đồng sắp hết hạn / đã hết hạn, dịch vụ tới
 *       kỳ bảo trì và bảo hành sắp hết, ghép với lần nhắc gần nhất trong `customer_reminder_logs`. Không có
 *       bảng hàng đợi và không có cron: danh sách luôn khớp với dữ liệu hiện tại.
 *     tags:
 *       - Reminders
 *     responses:
 *       200:
 *         description: Danh sách việc cần nhắc, sớm nhất trước.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ReminderItem'
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới xem được hàng đợi nhắc việc.
 *       500:
 *         description: Không tải được hàng đợi nhắc việc.
 *   post:
 *     summary: Log a sent reminder
 *     description: |
 *       Ghi nhận một lần đã nhắc khách (email/điện thoại/gặp). Mỗi việc chỉ ghi một lần mỗi ngày: gửi lại
 *       trong cùng ngày trả `409` thay vì tạo hai dòng trùng.
 *     tags:
 *       - Reminders
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReminderInput'
 *     responses:
 *       201:
 *         description: Đã ghi nhận.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CustomerReminderLog'
 *       400:
 *         description: Một trường không hợp lệ.
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới ghi được nhắc việc.
 *       409:
 *         description: Việc này đã được ghi nhận trong hôm nay.
 *       500:
 *         description: Không ghi được nhắc việc.
 */
import { NextResponse, type NextRequest } from "next/server";

import { requireCapability } from "@/app/api/_lib/requireCaller";
import { parseReminderBody } from "@/app/api/_lib/crmBodies";
import { crmBadRequest, crmErrorResponse } from "@/app/api/_lib/crmErrorResponse";
import { readJsonBody } from "@/app/api/_lib/crmRequest";
import { SupabaseCustomerContractRepository } from "@/lib/infrastructure/repositories/SupabaseCustomerContractRepository";
import { SupabaseCustomerReminderRepository } from "@/lib/infrastructure/repositories/SupabaseCustomerReminderRepository";
import { SupabaseCustomerServiceRepository } from "@/lib/infrastructure/repositories/SupabaseCustomerServiceRepository";
import { ListRemindersUseCase } from "@/lib/usecases/ListRemindersUseCase";
import { LogReminderUseCase } from "@/lib/usecases/LogReminderUseCase";

export async function GET() {
  const caller = await requireCapability("maintenance:manage");

  if (!caller.ok) {
    return caller.response;
  }

  try {
    const items = await new ListRemindersUseCase(
      new SupabaseCustomerContractRepository(),
      new SupabaseCustomerServiceRepository(),
      new SupabaseCustomerReminderRepository(),
    ).execute();

    return NextResponse.json(items);
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to load the reminder queue",
      "Không tải được hàng đợi nhắc việc.",
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

  const parsed = parseReminderBody(body.value);

  if (!parsed.ok) {
    return crmBadRequest(parsed.error);
  }

  try {
    const log = await new LogReminderUseCase(
      new SupabaseCustomerReminderRepository(),
    ).execute(parsed.value);

    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to log the reminder",
      "Không ghi được nhắc việc.",
    );
  }
}
