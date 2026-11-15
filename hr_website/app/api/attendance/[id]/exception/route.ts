/**
 * @swagger
 * /api/attendance/{id}/exception:
 *   patch:
 *     summary: Close (or re-open) an abnormal-timekeeping note on one record
 *     description: |
 *       Ghi nhận quyết định của quản lý cho một bất thường chấm công (A4 / SCRUM-97). Các bất thường
 *       (đi muộn, thiếu giờ ra, ngoài vùng, ngoài lịch, khác ca/chi nhánh đã xếp, gửi muộn, khiếu nại
 *       chưa xử lý) được **suy ra** ở `lib/usecases/attendanceExceptions.ts` chứ không lưu vào cột; cột
 *       ở đây chỉ lưu **quyết định**: ai, khi nào, vì sao.
 *
 *       Tách khỏi `verified_at` (SCRUM-23) là có chủ ý: `verified_at` nói "bảng công đúng", còn
 *       `exception_status = RESOLVED` nói "bất thường này đã được xem xét và chốt". Đóng bất thường
 *       **không sửa** giờ vào/ra, trạng thái hay khoảng cách — muốn sửa số liệu thì dùng
 *       `PATCH /api/attendance/{id}` (Sửa giờ, có lý do).
 *
 *       `RESOLVED` bắt buộc có `note`; `OPEN` mở lại và xoá ghi chú/người xử lý để dòng không giữ lại
 *       lời giải thích của một quyết định đã bị huỷ.
 *
 *       Quyền: `attendance:review` (OWNER/MANAGER) và chỉ với chi nhánh người gọi phụ trách (SCRUM-61).
 *       Nhân viên không đóng được bất thường của chính mình — trigger `attendance_guard_exception_resolution`
 *       từ chối ở tầng dữ liệu.
 *
 *       Khi đóng, nhân viên nhận thông báo `ATTENDANCE_EXCEPTION_RESOLVED` (nếu chuông đang bật).
 *     tags:
 *       - Attendance
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID bản ghi chấm công.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [OPEN, RESOLVED]
 *                 description: "RESOLVED đóng bất thường; OPEN mở lại (và xoá ghi chú cũ)."
 *               note:
 *                 type: string
 *                 maxLength: 500
 *                 nullable: true
 *                 example: Đã kiểm tra camera, nhân viên vào muộn do sự cố xe; trừ 10 phút theo quy định.
 *                 description: Bắt buộc khi `status = RESOLVED`; bị bỏ qua (và xoá) khi `OPEN`.
 *     responses:
 *       200:
 *         description: Bản ghi sau khi lưu quyết định (kèm `exception_status`, `exception_note`, người và thời điểm xử lý).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Attendance'
 *       400:
 *         description: ID không phải UUID, JSON không hợp lệ, `status` lạ, `note` không phải chuỗi, hoặc thiếu ghi chú khi đóng.
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
 *         description: Vai trò không được xử lý bất thường, hoặc chi nhánh không do người gọi phụ trách.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Không có bản ghi đó (hoặc RLS không cho người gọi thấy).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Không lưu được quyết định (lỗi máy chủ, hoặc CSDL chưa chạy SCRUM-97).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

import { NextResponse } from "next/server";

import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  ATTENDANCE_EXCEPTION_STATUSES,
  type AttendanceExceptionStatus,
} from "@/lib/domain/entities/Attendance";
import { AttendanceExceptionInputError } from "@/lib/domain/errors/AttendanceExceptionInputError";
import { AttendanceNotFoundError } from "@/lib/domain/errors/AttendanceNotFoundError";
import { BranchForbiddenError } from "@/lib/domain/errors/BranchForbiddenError";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import { SupabaseAttendanceRepository } from "@/lib/infrastructure/repositories/SupabaseAttendanceRepository";
import { SupabaseBranchRepository } from "@/lib/infrastructure/repositories/SupabaseBranchRepository";
import { ResolveAttendanceExceptionUseCase } from "@/lib/usecases/ResolveAttendanceExceptionUseCase";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATUS_SET: ReadonlySet<string> = new Set(ATTENDANCE_EXCEPTION_STATUSES);

type ExceptionRequest = {
  status?: unknown;
  note?: unknown;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "ID bảng công phải là UUID." },
      { status: 400 },
    );
  }

  let body: ExceptionRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Nội dung yêu cầu phải là JSON hợp lệ." },
      { status: 400 },
    );
  }

  if (typeof body.status !== "string" || !STATUS_SET.has(body.status)) {
    return NextResponse.json(
      {
        error: `status phải là một trong: ${ATTENDANCE_EXCEPTION_STATUSES.join(", ")}.`,
      },
      { status: 400 },
    );
  }

  // An optional field is omitted **or null** (the page clears it with `value || null`), so both are
  // accepted — the trap that once made `PUT /api/revenue/close` fail on a blank note.
  if (
    body.note !== undefined &&
    body.note !== null &&
    typeof body.note !== "string"
  ) {
    return NextResponse.json(
      { error: "note phải là chuỗi hoặc null." },
      { status: 400 },
    );
  }

  try {
    // Answering an anomaly is a management action (SCRUM-59). The use case repeats the role rule and
    // the branch scope, and the database guard refuses an employee's write as the third layer.
    const caller = await requireCapability("attendance:review");

    if (!caller.ok) {
      return caller.response;
    }

    const resolve = new ResolveAttendanceExceptionUseCase(
      new SupabaseAttendanceRepository(),
      new SupabaseBranchRepository(),
    );

    const record = await resolve.execute({
      attendanceId: id,
      status: body.status as AttendanceExceptionStatus,
      note: typeof body.note === "string" ? body.note : null,
      // Ownership always comes from the session.
      resolverId: caller.userId,
      resolverRole: caller.role,
    });

    return NextResponse.json(record);
  } catch (error) {
    if (error instanceof AttendanceNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof AttendanceExceptionInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof BranchForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof BranchNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Failed to resolve attendance exception", error);

    return NextResponse.json(
      { error: "Không thể xử lý bất thường chấm công." },
      { status: 500 },
    );
  }
}
