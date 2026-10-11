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
 *         description: Authentication is required.
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
 *     responses:
 *       201:
 *         description: The stored request, with its requester embedded.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RequestEntity'
 *       400:
 *         description: The JSON body is invalid, request_type is unknown, or title/content is blank or too long.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication is required.
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
 *       500:
 *         description: An unexpected server error occurred.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse, type NextRequest } from "next/server";

import {
  isRequestType,
  MAX_REQUEST_CONTENT_LENGTH,
  MAX_REQUEST_TITLE_LENGTH,
  REQUEST_TYPES,
} from "@/lib/domain/entities/RequestEntity";
import { BranchForbiddenError } from "@/lib/domain/errors/BranchForbiddenError";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import { RequestBranchForbiddenError } from "@/lib/domain/errors/RequestBranchForbiddenError";
import { RequestBranchNotAssignedError } from "@/lib/domain/errors/RequestBranchNotAssignedError";
import { RequestInputError } from "@/lib/domain/errors/RequestInputError";
import { SupabaseBranchRepository } from "@/lib/infrastructure/repositories/SupabaseBranchRepository";
import { SupabaseRequestRepository } from "@/lib/infrastructure/repositories/SupabaseRequestRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";
import { CreateRequestUseCase } from "@/lib/usecases/CreateRequestUseCase";
import { GetFilteredRequestsUseCase } from "@/lib/usecases/GetFilteredRequestsUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";

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
      { error: "branch_id must be a UUID or all." },
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
        { error: "Authentication is required." },
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
      { error: "Unable to retrieve requests." },
      { status: 500 },
    );
  }
}

type CreateRequestBody = {
  branch_id?: unknown;
  request_type?: unknown;
  title?: unknown;
  content?: unknown;
};

export async function POST(request: Request) {
  let body: CreateRequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof body.branch_id !== "string" ||
    !UUID_PATTERN.test(body.branch_id)
  ) {
    return NextResponse.json(
      { error: "branch_id is required and must be a UUID." },
      { status: 400 },
    );
  }

  if (!isRequestType(body.request_type)) {
    return NextResponse.json(
      { error: `request_type must be one of: ${REQUEST_TYPES.join(", ")}.` },
      { status: 400 },
    );
  }

  if (
    typeof body.title !== "string" ||
    !body.title.trim() ||
    body.title.trim().length > MAX_REQUEST_TITLE_LENGTH
  ) {
    return NextResponse.json(
      {
        error: `title is required and must be at most ${MAX_REQUEST_TITLE_LENGTH} characters.`,
      },
      { status: 400 },
    );
  }

  // `content` is optional and the screen clears it with `value.trim() || null`, so an omitted field
  // and an explicit `null` are both valid — only a wrong type or an over-long note is a `400`.
  if (
    body.content !== undefined &&
    body.content !== null &&
    (typeof body.content !== "string" ||
      body.content.trim().length > MAX_REQUEST_CONTENT_LENGTH)
  ) {
    return NextResponse.json(
      {
        error: `content must be a string of at most ${MAX_REQUEST_CONTENT_LENGTH} characters.`,
      },
      { status: 400 },
    );
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
    );
    const created = await createRequest.execute({
      branchId: body.branch_id,
      requestType: body.request_type,
      title: body.title,
      content: typeof body.content === "string" ? body.content : null,
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
      { error: "Unable to submit the request." },
      { status: 500 },
    );
  }
}
