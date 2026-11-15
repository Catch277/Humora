/**
 * @swagger
 * /api/payroll/profiles:
 *   get:
 *     summary: List the hourly rates
 *     description: |
 *       Đơn giá giờ của nhân viên (SCRUM-90), mới nhất trước. Chủ sở hữu đọc được toàn bộ tổ chức; mọi vai
 *       trò khác chỉ đọc được đơn giá của chính mình (RLS `pay_profiles_select`).
 *
 *       Một lần tăng lương là một dòng mới (`effective_from`), không phải sửa dòng cũ, nên lịch sử — và con
 *       số mà một phiếu lương đã phát hành được tính từ đó — vẫn còn nguyên.
 *
 *       Sửa hoặc xoá một dòng đã lưu thì dùng `PATCH` / `DELETE /api/payroll/profiles/{id}` (SCRUM-92): `PUT`
 *       vẫn là đường tạo mới (hoặc ghi đè đúng cặp `employeeId` + `effectiveFrom` đó).
 *     tags:
 *       - Payroll
 *     responses:
 *       200:
 *         description: The rates the caller may read.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PayProfile'
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Vai trò của bạn không được phép làm việc này.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Không thể tải bảng đơn giá giờ.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   put:
 *     summary: Store one hourly rate
 *     description: |
 *       Ghi đơn giá giờ của một nhân viên, hiệu lực từ `effectiveFrom` (SCRUM-90). Chỉ chủ sở hữu tổ chức
 *       (`payroll:manage`); `set_pay_profile` đọc tổ chức và người thao tác từ phiên đăng nhập nên không có
 *       trường nào trong body chỉ được sang tổ chức khác.
 *
 *       Gửi lại cùng `(employeeId, effectiveFrom)` sẽ cập nhật dòng đó (unique index), nhờ vậy sửa một con
 *       số vừa nhập sai không tạo ra hai dòng cùng ngày.
 *     tags:
 *       - Payroll
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [employeeId, hourlyRate, effectiveFrom]
 *             properties:
 *               employeeId:
 *                 type: string
 *                 format: uuid
 *               hourlyRate:
 *                 type: integer
 *                 description: VND cho một giờ, 0..10.000.000.
 *               effectiveFrom:
 *                 type: string
 *                 format: date
 *                 description: Ngày bắt đầu áp dụng (YYYY-MM-DD).
 *               overtimeMultiplier:
 *                 type: number
 *                 description: Hệ số ca tăng ca, 1..5, tối đa 2 chữ số thập phân (mặc định 1.5).
 *               fixedAllowance:
 *                 type: integer
 *                 description: Phụ cấp cố định mỗi tháng, 0..1.000.000.000 (mặc định 0).
 *               note:
 *                 type: string
 *                 nullable: true
 *                 description: Ghi chú của người nhập (tối đa 500 ký tự).
 *     responses:
 *       200:
 *         description: The stored rate.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [id]
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *       400:
 *         description: Một trường không hợp lệ (UUID, số nguyên trong khoảng, ngày, ghi chú quá dài).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Chỉ chủ sở hữu tổ chức mới được quản lý bảng lương.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Không tìm thấy nhân viên trong tổ chức.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Không thể lưu đơn giá giờ.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse, type NextRequest } from "next/server";

import { SupabasePayrollRepository } from "@/lib/infrastructure/repositories/SupabasePayrollRepository";
import { ListPayProfilesUseCase } from "@/lib/usecases/ListPayProfilesUseCase";
import { SetPayProfileUseCase } from "@/lib/usecases/SetPayProfileUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  payrollBadRequest,
  payrollErrorResponse,
} from "@/app/api/payroll/_lib/payrollErrorResponse";
import {
  parsePayProfileBody,
  readJsonBody,
} from "@/app/api/payroll/_lib/payrollRequest";

export async function GET() {
  const caller = await requireCapability("payroll:view");

  if (!caller.ok) {
    return caller.response;
  }

  try {
    const profiles = await new ListPayProfilesUseCase(
      new SupabasePayrollRepository(),
    ).execute();

    return NextResponse.json(profiles);
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to list the pay profiles",
      "Không thể tải bảng đơn giá giờ.",
    );
  }
}

export async function PUT(request: NextRequest) {
  const caller = await requireCapability("payroll:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const body = await readJsonBody(request);

  if (!body.ok) {
    return payrollBadRequest(body.error);
  }

  const parsed = parsePayProfileBody(body.value);

  if (!parsed.ok) {
    return payrollBadRequest(parsed.error);
  }

  try {
    const result = await new SetPayProfileUseCase(
      new SupabasePayrollRepository(),
    ).execute(parsed.value);

    return NextResponse.json(result);
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to save the pay profile",
      "Không thể lưu đơn giá giờ.",
    );
  }
}
