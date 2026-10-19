/**
 * @swagger
 * /api/requests:
 *   get:
 *     summary: List staff requests
 *     description: |
 *       The approval queue of SCRUM-41: leave, shift-swap and adjustment requests with the
 *       requester name embedded from `requests.user_id`. The value `all` disables a filter, which
 *       is what the dashboard pills send.
 *     tags:
 *       - Requests
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, APPROVED, REJECTED, all]
 *         description: Exact status to filter by; "all" disables this filter.
 *       - in: query
 *         name: branch_id
 *         schema:
 *           type: string
 *         description: Branch UUID to filter by; "all" disables this filter.
 *     responses:
 *       200:
 *         description: Requests matching the optional filters, most recently updated first.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RequestEntity'
 *       400:
 *         description: branch_id is neither a UUID nor "all".
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
 *       500:
 *         description: An unexpected server error occurred.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   post:
 *     summary: Submit a request
 *     description: |
 *       Files the caller's own đơn (SCRUM-41: nghỉ phép, đổi ca, điều chỉnh công) as `PENDING` for a
 *       manager to review. This is the submit half of the ticket — the queue above can only fill if
 *       somebody writes a row, and nothing else in this app inserts into `public.requests`.
 *       The requester always comes from the session (`requests_insert_own` refuses a row whose
 *       `user_id` is not the caller), and every role holds `request:create` **except the
 *       organization's `OWNER`** (SCRUM-63): the owner sits above the approval chain and reviews the
 *       queue instead of filing into it.
 *
 *       SCRUM-82: a đơn that acts on a day must name it (`work_date`), and "Đổi ca" additionally names the
 *       ca (`shift_id`) and the colleague who takes it (`target_employee_id`). The day may not be in the
 *       past — a schedule is a statement about work still to come, exactly like `POST /api/schedules`
 *       (`SCRUM-81`) — and the ca named must be one the caller still holds, on that day, and not already
 *       over. `GET /api/requests/swap-candidates` is what fills the colleague picker.
 *     tags:
 *       - Requests
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - branch_id
 *               - request_type
 *               - title
 *             properties:
 *               branch_id:
 *                 type: string
 *                 format: uuid
 *                 description: "Chi nhánh liên quan (public.branches.id); một chi nhánh bạn không nhìn thấy được trả về 404."
 *               request_type:
 *                 type: string
 *                 enum: [Nghỉ phép, Đổi ca, Điều chỉnh công, Khác]
 *                 description: "Loại đơn, đúng giá trị của REQUEST_TYPES trong lib/domain/entities/RequestEntity.ts."
 *               title:
 *                 type: string
 *                 maxLength: 120
 *                 example: Xin nghỉ phép ngày 12/10
 *               content:
 *                 type: string
 *                 maxLength: 500
 *                 nullable: true
 *                 description: "Nội dung chi tiết; bỏ trống hoặc null là đơn không có ghi chú thêm."
 *               work_date:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *                 example: "2026-10-20"
 *                 description: "Ngày đơn hướng tới (SCRUM-82). Bắt buộc với nghỉ phép / đổi ca / điều chỉnh công, phải từ hôm nay trở đi (giờ Asia/Bangkok); bỏ trống với đơn “Khác”."
 *               shift_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: "Ca cần đổi (public.shifts.id). Bắt buộc với đơn “Đổi ca”, và phải là ca bạn đang được xếp trong ngày đó."
 *               target_employee_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: "Đồng nghiệp nhận ca (public.users.id). Bắt buộc với đơn “Đổi ca”; phải nằm trong danh sách GET /api/requests/swap-candidates."
 *     responses:
 *       201:
 *         description: The stored request, with its requester embedded.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RequestEntity'
 *       400:
 *         description: The JSON body is invalid, request_type is unknown, title/content is blank or too long, work_date is missing or malformed for the type, shift_id/target_employee_id is missing or malformed for a "Đổi ca" request, the day is in the past, or the ca is no longer the caller's own or has already ended.
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
 *         description: The account has no user profile, the role may not file a request (SCRUM-59 — the organization's OWNER never does, SCRUM-63), the account is not assigned to a branch yet, or it names a branch other than its own — or, for a manager, a branch they do not head (SCRUM-61/63).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: The branch does not exist or is not visible to the caller.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: The colleague named by a "Đổi ca" request cannot take that ca (SCRUM-82) — they are not in the caller's branch, have left, or took an overlapping ca in the meantime. The screen reloads GET /api/requests/swap-candidates and the caller picks again.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: An unexpected server error occurred.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse, type NextRequest } from "next/server";

import { BranchForbiddenError } from "@/lib/domain/errors/BranchForbiddenError";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import { RequestBranchForbiddenError } from "@/lib/domain/errors/RequestBranchForbiddenError";
import { RequestBranchNotAssignedError } from "@/lib/domain/errors/RequestBranchNotAssignedError";
import { RequestInputError } from "@/lib/domain/errors/RequestInputError";
import { RequestShiftDetailsError } from "@/lib/domain/errors/RequestShiftDetailsError";
import { RequestSwapTargetNotFreeError } from "@/lib/domain/errors/RequestSwapTargetNotFreeError";
import { SupabaseBranchRepository } from "@/lib/infrastructure/repositories/SupabaseBranchRepository";
import { SupabaseRequestRepository } from "@/lib/infrastructure/repositories/SupabaseRequestRepository";
import { SupabaseShiftAssignmentRepository } from "@/lib/infrastructure/repositories/SupabaseShiftAssignmentRepository";
import { SupabaseSwapCandidateRepository } from "@/lib/infrastructure/repositories/SupabaseSwapCandidateRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";
import { CreateRequestUseCase } from "@/lib/usecases/CreateRequestUseCase";
import { GetFilteredRequestsUseCase } from "@/lib/usecases/GetFilteredRequestsUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import { parseRequestPayload } from "@/app/api/requests/_lib/requestRequest";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The pills send `all` to mean "no filter on this dimension". */
function activeFilter(value: string | null): string | undefined {
  return value && value !== "all" ? value : undefined;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const status = activeFilter(params.get("status"));
  const branchId = activeFilter(params.get("branch_id"));

  if (branchId && !UUID_PATTERN.test(branchId)) {
    return NextResponse.json(
      { error: "branch_id phải là UUID hoặc all." },
      { status: 400 },
    );
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Bạn cần đăng nhập để thực hiện thao tác này." },
        { status: 401 },
      );
    }

    const getRequests = new GetFilteredRequestsUseCase(
      new SupabaseRequestRepository(),
    );
    const requests = await getRequests.execute({ status, branchId });

    return NextResponse.json(requests);
  } catch (error) {
    console.error("Failed to list requests", error);
    return NextResponse.json(
      { error: "Không thể tải danh sách đơn từ." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Nội dung yêu cầu phải là JSON hợp lệ." }, { status: 400 });
  }

  // The parser validates shapes only (a UUID, a calendar date, a length) and whether the request type
  // carries the field at all (SCRUM-82); the rules that *act* on the values are the use case's.
  const parsed = parseRequestPayload(payload);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    // Filing one's own đơn is open to every member (SCRUM-59 `request:create`); the insert policy
    // `requests_insert_own` is what keeps the row the caller's own and `PENDING`.
    const caller = await requireCapability("request:create");

    if (!caller.ok) {
      return caller.response;
    }

    const createRequest = new CreateRequestUseCase(
      new SupabaseRequestRepository(),
      new SupabaseBranchRepository(),
      // SCRUM-82: a "Đổi ca" đơn is checked against the caller's own schedule and against the colleague
      // picker's rule before it is stored.
      new SupabaseShiftAssignmentRepository(),
      new SupabaseSwapCandidateRepository(),
    );
    const created = await createRequest.execute({
      ...parsed.input,
      // The requester is the session, never the body — and so are the role and the branch they
      // belong to, which SCRUM-63 compares against the branch the đơn names.
      requesterId: caller.userId,
      requesterRole: caller.role,
      requesterBranchId: caller.profile.branch_id,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof BranchNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // SCRUM-82: the day is in the past, the ca is not the caller's, or an id of the "Đổi ca" pair is
    // missing — all of them are the caller's payload being wrong, so `400` with the sentence that says
    // which one.
    if (error instanceof RequestShiftDetailsError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // SCRUM-82: the colleague the đơn names cannot take that ca. A business conflict with the schedule,
    // not a malformed payload — the screen reloads the candidate list and the caller picks again.
    if (error instanceof RequestSwapTargetNotFreeError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    // SCRUM-63: an employee files for their own branch, an unassigned account files nothing, and a
    // manager files only for a branch they head (`BranchForbiddenError`).
    if (
      error instanceof BranchForbiddenError ||
      error instanceof RequestBranchNotAssignedError ||
      error instanceof RequestBranchForbiddenError
    ) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("Failed to submit request", error);
    return NextResponse.json(
      { error: "Không thể gửi đơn." },
      { status: 500 },
    );
  }
}
