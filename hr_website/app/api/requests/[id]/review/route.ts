/**
 * @swagger
 * /api/requests/{id}/review:
 *   patch:
 *     summary: Approve or reject a request
 *     description: |
 *       Sets `requests.status` together with `reject_reason` and `approver_id`. Restricted to
 *       managers (SCRUM-59 `request:review`): the route answers `403` for another role, the use
 *       case repeats the check and the `requests_update_managers` RLS policy (SCRUM-41) repeats it
 *       in the database.
 *     tags:
 *       - Requests
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [APPROVED, REJECTED]
 *               reject_reason:
 *                 type: string
 *                 maxLength: 500
 *                 nullable: true
 *                 description: Required and non-empty when status is REJECTED.
 *     responses:
 *       200:
 *         description: The updated request.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RequestEntity'
 *       400:
 *         description: The id is not a UUID, the body is invalid, or a rejection has no reason.
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
 *         description: The caller has no user profile, the role may not review requests, they do not head the branch the request belongs to (SCRUM-61), or the request is their own (SCRUM-63 — only the organization's OWNER may review their own đơn).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: The request does not exist or is not reviewable by the caller.
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
import { NextResponse } from "next/server";

import type { ReviewStatus } from "@/lib/domain/entities/RequestEntity";
import { BranchForbiddenError } from "@/lib/domain/errors/BranchForbiddenError";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import { RequestNotFoundError } from "@/lib/domain/errors/RequestNotFoundError";
import { RequestReviewForbiddenError } from "@/lib/domain/errors/RequestReviewForbiddenError";
import { RequestSelfReviewError } from "@/lib/domain/errors/RequestSelfReviewError";
import { SupabaseBranchRepository } from "@/lib/infrastructure/repositories/SupabaseBranchRepository";
import { SupabaseRequestRepository } from "@/lib/infrastructure/repositories/SupabaseRequestRepository";
import { ReviewRequestUseCase } from "@/lib/usecases/ReviewRequestUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ReviewRequestBody = {
  status?: unknown;
  reject_reason?: unknown;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "The request id must be a UUID." },
      { status: 400 },
    );
  }

  let body: ReviewRequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.status !== "APPROVED" && body.status !== "REJECTED") {
    return NextResponse.json(
      { error: "status must be APPROVED or REJECTED." },
      { status: 400 },
    );
  }

  if (
    body.reject_reason !== undefined &&
    body.reject_reason !== null &&
    (typeof body.reject_reason !== "string" || body.reject_reason.length > 500)
  ) {
    return NextResponse.json(
      { error: "reject_reason must be a string of at most 500 characters." },
      { status: 400 },
    );
  }

  const status: ReviewStatus = body.status;
  const rejectReason =
    typeof body.reject_reason === "string" ? body.reject_reason : null;

  try {
    // Approving or rejecting is a management action (SCRUM-59). The role still travels into the use
    // case, which repeats the rule and the `requests_update_managers` policy repeats it in the database.
    const caller = await requireCapability("request:review");

    if (!caller.ok) {
      return caller.response;
    }

    const reviewRequest = new ReviewRequestUseCase(
      new SupabaseRequestRepository(),
      new SupabaseBranchRepository(),
    );
    const reviewed = await reviewRequest.execute({
      requestId: id,
      status,
      rejectReason,
      // Ownership always comes from the session.
      approverId: caller.userId,
      approverRole: caller.role,
    });

    return NextResponse.json(reviewed);
  } catch (error) {
    if (error instanceof RequestNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof RequestReviewForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    // SCRUM-63: a branch head cannot decide their own đơn — the organization's owner does.
    if (error instanceof RequestSelfReviewError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof BranchForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof BranchNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (
      error instanceof Error &&
      error.message.startsWith("reject_reason is required")
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to review request", error);
    return NextResponse.json(
      { error: "Unable to review the request." },
      { status: 500 },
    );
  }
}
