/**
 * @swagger
 * /api/payroll/demo-salaries:
 *   get:
 *     summary: Danh sách lương thử việc (demo) theo vị trí
 *     description: |
 *       Các mức lương thử việc của tổ chức (SCRUM-100), mới nhất trước. Chỉ chủ sở hữu tổ chức
 *       (`payroll:manage`) đọc được — RLS `demo_pay_salaries_select_owner` giới hạn ở đúng tổ chức trong phiên.
 *
 *       Đây là **dữ liệu mô phỏng**: một dòng ở đây không đi vào `attendance`, `pay_profiles`, `payslips`, KPI
 *       lương hay thông báo. Vị trí đầu tiên và mặc định là Giám đốc (`DIRECTOR`).
 *     tags:
 *       - Payroll
 *     parameters:
 *       - in: query
 *         name: position
 *         schema:
 *           type: string
 *           example: DIRECTOR
 *         description: Lọc theo mã vị trí.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, ARCHIVED]
 *         description: Lọc theo trạng thái.
 *     responses:
 *       200:
 *         description: The trial salaries, newest effective date first.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/DemoPaySalary'
 *       400:
 *         description: status không thuộc ACTIVE/ARCHIVED.
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
 *         description: Không tải được lương thử việc (thường là chưa chạy `SCRUM-100_demo_pay_salaries.sql`).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   post:
 *     summary: Thêm một mức lương thử việc
 *     description: |
 *       Thêm một dòng lương demo cho một vị trí (SCRUM-100). `gross_amount` và `net_amount` do SQL tính từ các
 *       thành phần (`gross = monthly_hours × hourly_rate + allowance + bonus`, `net = gross − deduction`), nên
 *       client không gửi và không sửa được hai con số tổng.
 *
 *       `409` khi vị trí đó đã có một dòng cùng `effectiveFrom` (unique index bỏ qua dòng `ARCHIVED`), `400`
 *       khi `deduction` vượt gross hoặc vị trí không thuộc danh sách app biết.
 *     tags:
 *       - Payroll
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DemoPaySalaryInput'
 *     responses:
 *       201:
 *         description: The id of the new row.
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
 *         description: Một trường không hợp lệ, vị trí không hợp lệ, hoặc khấu trừ vượt thu nhập.
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
 *       409:
 *         description: Vị trí này đã có mức lương thử việc bắt đầu từ ngày đó.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Không thêm được lương thử việc.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse, type NextRequest } from "next/server";

import { SupabaseDemoPaySalaryRepository } from "@/lib/infrastructure/repositories/SupabaseDemoPaySalaryRepository";
import { CreateDemoPaySalaryUseCase } from "@/lib/usecases/CreateDemoPaySalaryUseCase";
import { ListDemoPaySalariesUseCase } from "@/lib/usecases/ListDemoPaySalariesUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  payrollBadRequest,
  payrollErrorResponse,
} from "@/app/api/payroll/_lib/payrollErrorResponse";
import { parseDemoSalaryBody } from "@/app/api/payroll/_lib/demoSalaryRequest";
import { readJsonBody } from "@/app/api/payroll/_lib/payrollRequest";
import {
  isDemoPaySalaryStatus,
  type DemoPaySalaryStatus,
} from "@/lib/domain/entities/DemoPaySalary";

export async function GET(request: NextRequest) {
  const caller = await requireCapability("payroll:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const params = request.nextUrl.searchParams;
  const position = params.get("position") ?? undefined;
  const status = params.get("status");

  if (status !== null && !isDemoPaySalaryStatus(status)) {
    return payrollBadRequest("status phải là ACTIVE hoặc ARCHIVED.");
  }

  // Narrowed explicitly: `params.get` answers `string | null`, and only the two known codes become a filter.
  const statusFilter: DemoPaySalaryStatus | undefined = isDemoPaySalaryStatus(
    status,
  )
    ? status
    : undefined;

  try {
    const rows = await new ListDemoPaySalariesUseCase(
      new SupabaseDemoPaySalaryRepository(),
    ).execute({
      positionCode: position,
      status: statusFilter,
    });

    return NextResponse.json(rows);
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to list the demo salaries",
      "Không tải được lương thử việc.",
    );
  }
}

export async function POST(request: NextRequest) {
  const caller = await requireCapability("payroll:manage");

  if (!caller.ok) {
    return caller.response;
  }

  const body = await readJsonBody(request);

  if (!body.ok) {
    return payrollBadRequest(body.error);
  }

  const parsed = parseDemoSalaryBody(body.value);

  if (!parsed.ok) {
    return payrollBadRequest(parsed.error);
  }

  try {
    const id = await new CreateDemoPaySalaryUseCase(
      new SupabaseDemoPaySalaryRepository(),
    ).execute(parsed.value);

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return payrollErrorResponse(
      error,
      "Failed to create the demo salary",
      "Không thêm được lương thử việc.",
    );
  }
}
