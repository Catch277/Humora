/**
 * @swagger
 * /api/shift-registrations/{id}/cancel:
 *   post:
 *     summary: Withdraw your own pending shift registration
 *     tags:
 *       - Shift registrations
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: The registration, now `CANCELLED`.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ShiftRegistration'
 *       400:
 *         description: The id is not a UUID.
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
 *         description: The account has no profile or its role may not view schedules.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No such registration, or it belongs to someone else.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: The registration is no longer pending.
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
import { shiftWorkflowErrorResponse } from "@/app/api/_lib/shiftWorkflow";
import { SupabaseShiftRegistrationRepository } from "@/lib/infrastructure/repositories/SupabaseShiftRegistrationRepository";
import { CancelShiftRegistrationUseCase } from "@/lib/usecases/CancelShiftRegistrationUseCase";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const caller = await requireCapability("schedule:view");

    if (!caller.ok) {
      return caller.response;
    }

    const cancel = new CancelShiftRegistrationUseCase(
      new SupabaseShiftRegistrationRepository(),
    );

    return NextResponse.json(
      await cancel.execute({ registrationId: id, callerId: caller.userId }),
    );
  } catch (error) {
    const mapped = shiftWorkflowErrorResponse(error);

    if (mapped) {
      return mapped;
    }

    console.error("Failed to cancel the shift registration", error);
    return NextResponse.json(
      { error: "Unable to cancel the registration." },
      { status: 500 },
    );
  }
}
