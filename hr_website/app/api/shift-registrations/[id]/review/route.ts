/**
 * @swagger
 * /api/shift-registrations/{id}/review:
 *   post:
 *     summary: Approve or reject a shift registration
 *     description: |
 *       A manager's decision (SCRUM-23). Approving creates the assignment in the same transaction and
 *       is refused with `409` when the person is on leave or already works overlapping hours. A
 *       manager acts only for the branch they head (SCRUM-61); the owner for any. Rejecting needs a
 *       `reject_reason`.
 *     tags:
 *       - Shift registrations
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
 *         description: The reviewed registration.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ShiftRegistration'
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
 *         description: Not the owner or the head of this registration's branch.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No such registration in the caller's organization.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Already reviewed, or approving would clash with the person's schedule.
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
import { SupabaseShiftRegistrationRepository } from "@/lib/infrastructure/repositories/SupabaseShiftRegistrationRepository";
import { ReviewShiftRegistrationUseCase } from "@/lib/usecases/ReviewShiftRegistrationUseCase";

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

    const review = new ReviewShiftRegistrationUseCase(
      new SupabaseShiftRegistrationRepository(),
    );

    return NextResponse.json(
      await review.execute({
        registrationId: id,
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

    console.error("Failed to review the shift registration", error);
    return NextResponse.json(
      { error: "Unable to review the registration." },
      { status: 500 },
    );
  }
}
