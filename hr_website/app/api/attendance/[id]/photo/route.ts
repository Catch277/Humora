/**
 * @swagger
 * /api/attendance/{id}/photo:
 *   get:
 *     summary: Get a short-lived URL for a check-in or check-out photo
 *     description: |
 *       Trả về một liên kết có chữ ký (60 giây) cho ảnh chấm công đã lưu trong bucket **private**
 *       `attendance-photos` (SCRUM-95). Dòng bảng công giữ **đường dẫn object**, không giữ URL, nên
 *       trình duyệt không đọc được ảnh nếu chưa qua endpoint này.
 *
 *       Hai lớp quyết định ai xem được ảnh: dòng `attendance` được đọc qua RLS (một nhân viên chỉ thấy
 *       bản ghi trong chi nhánh của mình, quản lý thấy tổ chức — SCRUM-60/63), và policy của Storage chỉ
 *       cho phép ký đúng ảnh **của chính người gọi** hoặc ảnh trong tổ chức của quản lý/chủ sở hữu. Một
 *       đồng nghiệp cùng chi nhánh thấy dòng công nhưng không lấy được ảnh: `404`.
 *
 *       `kind` chọn ảnh vào ca (`in`, mặc định) hay ảnh ra ca (`out`). Một dòng do web chấm công không
 *       có ảnh, nên `404` là câu trả lời bình thường — màn hình hiển thị "Chưa có ảnh".
 *
 *       Ảnh được lưu 90 ngày (`attendance_photo_retention_days()`); sau thời hạn đó object bị xoá và
 *       endpoint trả `404` dù dòng bảng công vẫn còn.
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
 *       - in: query
 *         name: kind
 *         required: false
 *         schema:
 *           type: string
 *           enum: [in, out]
 *           default: in
 *         description: Ảnh vào ca (`in`) hoặc ảnh ra ca (`out`).
 *     responses:
 *       200:
 *         description: Liên kết có chữ ký và thời điểm hết hạn của nó.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [url, expires_at]
 *               properties:
 *                 url:
 *                   type: string
 *                   format: uri
 *                   description: URL có chữ ký, chỉ dùng được trong 60 giây.
 *                 expires_at:
 *                   type: string
 *                   format: date-time
 *                   description: Thời điểm liên kết hết hiệu lực (UTC).
 *       400:
 *         description: ID không phải UUID, hoặc `kind` không phải `in`/`out`.
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
 *         description: Tài khoản chưa có hồ sơ người dùng.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Không có bản ghi đó, bản ghi không có ảnh loại này, hoặc ảnh không còn trong kho lưu trữ.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Không ký được liên kết (lỗi kho lưu trữ hoặc cấu hình).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

import { NextResponse, type NextRequest } from "next/server";

import { requireCaller } from "@/app/api/_lib/requireCaller";
import {
  ATTENDANCE_PHOTO_KINDS,
  type AttendancePhotoKind,
} from "@/lib/domain/entities/Attendance";
import {
  isAttendancePhotoPath,
  signAttendancePhoto,
} from "@/lib/infrastructure/attendancePhotoStorage";
import { SupabaseAttendanceRepository } from "@/lib/infrastructure/repositories/SupabaseAttendanceRepository";
import { GetAttendancePhotoUseCase } from "@/lib/usecases/GetAttendancePhotoUseCase";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const KIND_SET: ReadonlySet<string> = new Set(ATTENDANCE_PHOTO_KINDS);

/**
 * A face photo is the evidence behind a timesheet row, so the read is deliberately two-layered:
 *
 *   * `requireCaller()` (not `requireCapability("attendance:view")`) because an employee may fetch
 *     their own photo — the web has no screen for it yet, but the rule belongs to the account, not to
 *     the job, and a `403` here would be the page's problem rather than the data's;
 *   * RLS on `attendance` decides whether the *row* is visible, and the storage policy of SCRUM-95
 *     decides whether the *object* may be signed. A colleague in the same branch can see the row but
 *     not the face: the second layer answers `404`, which is also what a retention-deleted object and
 *     another tenant's path answer.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "ID bảng công phải là UUID." },
      { status: 400 },
    );
  }

  const kind = request.nextUrl.searchParams.get("kind") ?? "in";

  if (!KIND_SET.has(kind)) {
    return NextResponse.json(
      { error: "kind phải là một trong: in, out." },
      { status: 400 },
    );
  }

  try {
    const caller = await requireCaller();

    if (!caller.ok) {
      return caller.response;
    }

    const lookup = new GetAttendancePhotoUseCase(
      new SupabaseAttendanceRepository(),
    );
    const photo = await lookup.execute({
      attendanceId: id,
      kind: kind as AttendancePhotoKind,
    });

    if (!photo.found) {
      return NextResponse.json(
        { error: "Không tìm thấy bản ghi chấm công." },
        { status: 404 },
      );
    }

    if (!photo.path) {
      return NextResponse.json(
        { error: "Bản ghi này không có ảnh chấm công." },
        { status: 404 },
      );
    }

    // A value outside the documented shape is a legacy row or a hand-written insert: never hand it to
    // the browser as an address, and never let it reach the storage client as a bucket path.
    if (!isAttendancePhotoPath(photo.path)) {
      console.error("Attendance photo path is not in the documented shape", {
        attendanceId: id,
        kind,
      });

      return NextResponse.json(
        { error: "Ảnh chấm công không còn trong kho lưu trữ." },
        { status: 404 },
      );
    }

    const link = await signAttendancePhoto(photo.path.trim());

    if (!link.ok) {
      if (link.missing) {
        return NextResponse.json(
          { error: "Ảnh chấm công không còn trong kho lưu trữ." },
          { status: 404 },
        );
      }

      console.error("Unable to sign attendance photo", link.error);

      return NextResponse.json(
        { error: "Không thể tải ảnh chấm công." },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: link.url, expires_at: link.expiresAt });
  } catch (error) {
    console.error("Failed to sign attendance photo", error);

    return NextResponse.json(
      { error: "Không thể tải ảnh chấm công." },
      { status: 500 },
    );
  }
}
