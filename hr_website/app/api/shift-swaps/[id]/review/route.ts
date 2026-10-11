/**
 * @swagger
 * /api/shift-swaps/{id}/review:
 *   post:
 *     summary: Approve or reject an accepted shift swap
 *     description: |
 *       Chuyển ca, step 3. A manager decides a swap the colleague already accepted. Approving moves
 *       the shift to the colleague in the same transaction, after re-checking that the shift is still
 *       the requester's, has no attendance yet, and still fits the colleague's schedule. A manager
 *       acts only for the branch they head (SCRUM-61); the owner for any. Rejecting needs a
 *       `reject_reason`.
 *     tags:
 *       - Shift swaps
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [approve]
 *             properties:
 *               approve: { type: boolean }
 *               reject_reason: { type: string, nullable: true, maxLength: 300 }
 *     responses:
 *       200:
 *         description: The reviewed swap.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ShiftSwap'
 *       400:
 *         description: The body or the id is invalid, or a rejection has no reason.
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
 *         description: Not the owner or the head of this swap's branch.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No such swap in the caller's organization.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: The colleague has not accepted yet, or the schedule changed so the move no longer fits.
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

import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  optionalString,
  readJsonObject,
  shiftWorkflowErrorResponse,
} from "@/app/api/_lib/shiftWorkflow";
import { SupabaseShiftSwapRepository } from "@/lib/infrastructure/repositories/SupabaseShiftSwapRepository";
import { ReviewShiftSwapUseCase } from "@/lib/usecases/ReviewShiftSwapUseCase";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await readJsonObject(request);

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rejectReason = optionalString(body.reject_reason);

  if (typeof body.approve !== "boolean" || rejectReason === undefined) {
    return NextResponse.json(
      {
        error:
          "approve must be a boolean and reject_reason a string or null.",
      },
      { status: 400 },
    );
  }

  try {
    const caller = await requireCapability("schedule:manage");

    if (!caller.ok) {
      return caller.response;
    }

    const review = new ReviewShiftSwapUseCase(new SupabaseShiftSwapRepository());

    return NextResponse.json(
      await review.execute({
        swapId: id,
        approve: body.approve,
        rejectReason,
        callerRole: caller.role,
      }),
    );
  } catch (error) {
    const mapped = shiftWorkflowErrorResponse(error);

    if (mapped) {
      return mapped;
    }

    console.error("Failed to review the shift swap", error);
    return NextResponse.json(
      { error: "Unable to review the shift swap." },
      { status: 500 },
    );
  }
}
