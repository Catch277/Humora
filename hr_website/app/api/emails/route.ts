/**
 * @swagger
 * /api/emails:
 *   get:
 *     summary: List logged e-mails
 *     description: |
 *       Nhật ký trao đổi email với khách (SCRUM-101, C3). Đây là bản ghi do người dùng lưu kèm liên kết
 *       luồng thư Gmail — ứng dụng không đọc hộp thư. Lọc ở server theo khách, hợp đồng, chiều và từ khoá.
 *     tags:
 *       - Customer emails
 *     parameters:
 *       - in: query
 *         name: customer_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: contract_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: direction
 *         schema: { type: string, enum: [INBOUND, OUTBOUND, NOTE] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách email đã ghi nhận.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CustomerEmail'
 *       400:
 *         description: Tham số lọc không hợp lệ.
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới xem được nhật ký email.
 *       500:
 *         description: Không tải được nhật ký email.
 *   post:
 *     summary: Log an e-mail exchange
 *     description: |
 *       Ghi lại một email đã trao đổi. `gmailThreadUrl` chỉ nhận `https://mail.google.com/…` vì giá trị
 *       được render thành liên kết; dán trùng `gmailMessageId` trả `409`.
 *     tags:
 *       - Customer emails
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CustomerEmailInput'
 *     responses:
 *       201:
 *         description: Email đã được ghi nhận.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CustomerEmail'
 *       400:
 *         description: Một trường không hợp lệ (email, liên kết Gmail, thời điểm).
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới ghi được nhật ký email.
 *       409:
 *         description: Email này đã được ghi nhận trước đó.
 *       500:
 *         description: Không ghi được email.
 */
import { NextResponse, type NextRequest } from "next/server";

import { requireCapability } from "@/app/api/_lib/requireCaller";
import { parseEmailBody } from "@/app/api/_lib/crmBodies";
import { crmBadRequest, crmErrorResponse } from "@/app/api/_lib/crmErrorResponse";
import { readJsonBody, UUID_PATTERN } from "@/app/api/_lib/crmRequest";
import { isEmailDirection } from "@/lib/domain/entities/CustomerEmail";
import { SupabaseCustomerContractRepository } from "@/lib/infrastructure/repositories/SupabaseCustomerContractRepository";
import { ListCustomerEmailsUseCase } from "@/lib/usecases/ListCustomerEmailsUseCase";
import { LogCustomerEmailUseCase } from "@/lib/usecases/LogCustomerEmailUseCase";

export async function GET(request: NextRequest) {
  const caller = await requireCapability("customer:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const params = request.nextUrl.searchParams;
  const direction = params.get("direction");
  const customerId = params.get("customer_id");
  const contractId = params.get("contract_id");

  if (direction !== null && !isEmailDirection(direction)) {
    return crmBadRequest("direction phải là INBOUND, OUTBOUND hoặc NOTE.");
  }

  if (customerId !== null && !UUID_PATTERN.test(customerId)) {
    return crmBadRequest("customer_id phải là UUID.");
  }

  if (contractId !== null && !UUID_PATTERN.test(contractId)) {
    return crmBadRequest("contract_id phải là UUID.");
  }

  try {
    const emails = await new ListCustomerEmailsUseCase(
      new SupabaseCustomerContractRepository(),
    ).execute({
      customerId: customerId ?? undefined,
      contractId: contractId ?? undefined,
      direction: isEmailDirection(direction) ? direction : undefined,
      search: params.get("search") ?? undefined,
    });

    return NextResponse.json(emails);
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to list the customer emails",
      "Không tải được nhật ký email.",
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

  const parsed = parseEmailBody(body.value);

  if (!parsed.ok) {
    return crmBadRequest(parsed.error);
  }

  try {
    const email = await new LogCustomerEmailUseCase(
      new SupabaseCustomerContractRepository(),
    ).execute(parsed.value);

    return NextResponse.json(email, { status: 201 });
  } catch (error) {
    return crmErrorResponse(
      error,
      "Failed to log the customer email",
      "Không ghi được email.",
    );
  }
}
