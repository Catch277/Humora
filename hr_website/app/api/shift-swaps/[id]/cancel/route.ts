/**
 * @swagger
 * /api/shift-swaps/{id}/cancel:
 *   post:
 *     summary: Withdraw a shift swap you requested
 *     description: Only the requester may cancel, and only while the swap is `PENDING` or `ACCEPTED`.
 *     tags:
 *       - Shift swaps
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: The swap, now `CANCELLED`.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ShiftSwap'
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
 *         description: No such swap among the caller's own requests.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: The swap is no longer open.
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
import { SupabaseShiftSwapRepository } from "@/lib/infrastructure/repositories/SupabaseShiftSwapRepository";
import { CancelShiftSwapUseCase } from "@/lib/usecases/CancelShiftSwapUseCase";

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

    const cancel = new CancelShiftSwapUseCase(new SupabaseShiftSwapRepository());

    return NextResponse.json(await cancel.execute({ swapId: id }));
  } catch (error) {
    const mapped = shiftWorkflowErrorResponse(error);

    if (mapped) {
      return mapped;
    }

    console.error("Failed to cancel the shift swap", error);
    return NextResponse.json(
      { error: "Unable to cancel the shift swap." },
      { status: 500 },
    );
  }
}
