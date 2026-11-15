/**
 * @swagger
 * /api/payroll/sync:
 *   post:
 *     summary: Đồng bộ lại lương của một tháng
 *     description: |
 *       Làm con số đang lưu khớp lại với bằng chứng (SCRUM-99). Chỉ chủ sở hữu tổ chức (`payroll:manage`).
 *
 *       `apply` thiếu hoặc `false` = **chạy thử**: chỉ trả về kế hoạch, không ghi gì, và `after_net` là con số
 *       phiếu *sẽ* có (tính bằng chính hàm mà bộ sinh phiếu dùng) nên `delta` là chênh lệch thật. `apply: true`
 *       mới gọi `generate_payslips` cho từng dòng cần sửa và trả lại con số sau khi ghi. Đây là mặc định có chủ ý
 *       — một tham số bị quên không được phép tạo lại tiền của cả tháng.
 *
 *       Không bao giờ bị đụng tới: phiếu **đã phát hành** (`SKIP` / `PUBLISHED`) và phiếu nháp của một tháng
 *       **không còn ca nào** (`SKIP` / `NO_ATTENDANCE` — `generate_payslips` sẽ xoá nó, một lần đồng bộ thì
 *       không). `employeeId` giới hạn lần chạy vào một người.
 *
 *       Cảnh báo có thật: chạy lại bộ sinh phiếu sẽ **xoá khoản `ADJUSTMENT`** (SCRUM-93) của những phiếu bị
 *       tính lại, vì chênh lệch đó được đo trên số giờ vừa thay đổi. Dòng nào có cờ `ADJUSTMENT` thì chủ sở
 *       hữu phải nhập lại "Lương thực nhận" sau khi đồng bộ.
 *     tags:
 *       - Payroll
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [month]
 *             properties:
 *               month:
 *                 type: string
 *                 example: "2026-10"
 *               apply:
 *                 type: boolean
 *                 description: true mới thật sự ghi; thiếu = chạy thử.
 *               employeeId:
 *                 type: string
 *                 format: uuid
 *                 description: Chỉ đồng bộ một nhân viên.
 *     responses:
 *       200:
 *         description: What the run did (or would do).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [period_start, applied, rows, changed, delta_total]
 *               properties:
 *                 period_start:
 *                   type: string
 *                   format: date
 *                 applied:
 *                   type: boolean
 *                 rows:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PayrollSyncRow'
 *                 changed:
 *                   type: integer
 *                 delta_total:
 *                   type: integer
 *       400:
 *         description: month không phải YYYY-MM, apply không phải boolean, employeeId không phải UUID, hoặc tháng ở tương lai (`PAYROLL_FUTURE_PERIOD`).
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
 *       500:
 *         description: Không đồng bộ được bảng lương (thường là chưa chạy `SCRUM-99_payroll_reconciliation.sql`).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse, type NextRequest } from "next/server";

import { SupabasePayrollRepository } from "@/lib/infrastructure/repositories/SupabasePayrollRepository";
import { SyncPayrollUseCase } from "@/lib/usecases/SyncPayrollUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  payrollBadRequest,
  payrollErrorResponse,
} from "@/app/api/payroll/_lib/payrollErrorResponse";
import {
  parsePayrollSyncBody,
  readJsonBody,
} from "@/app/api/payroll/_lib/payrollRequest";

export async function POST(request: NextRequest) {
  const caller = await requireCapability("payroll:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const body = await readJsonBody(request);

  if (!body.ok) {
    return payrollBadRequest(body.error);
  }

  const parsed = parsePayrollSyncBody(body.value);

  if (!parsed.ok) {
    return payrollBadRequest(parsed.error);
  }

  try {
    const result = await new SyncPayrollUseCase(
      new SupabasePayrollRepository(),
    ).execute(parsed.value);

    return NextResponse.json(result);
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to sync the payroll",
      "Không đồng bộ được bảng lương.",
    );
  }
}
