/**
 * @swagger
 * /api/shift-swaps/{id}/respond:
 *   post:
 *     summary: Accept or decline a shift offered to you
 *     description: |
 *       Chuyển ca, step 2. Only the colleague the shift was offered to may answer, and only while the
 *       swap is `PENDING`. Accepting passes it to the manager (`ACCEPTED`); declining ends it
 *       (`REJECTED`).
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
 *             required: [accept]
 *             properties:
 *               accept: { type: boolean }
 *     responses:
 *       200:
 *         description: The swap after the answer.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ShiftSwap'
 *       400:
 *         description: The body or the id is invalid.
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
 *         description: No such swap offered to the caller.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: The swap is no longer pending.
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
  readJsonObject,
  shiftWorkflowErrorResponse,
} from "@/app/api/_lib/shiftWorkflow";
import { SupabaseShiftSwapRepository } from "@/lib/infrastructure/repositories/SupabaseShiftSwapRepository";
import { RespondShiftSwapUseCase } from "@/lib/usecases/RespondShiftSwapUseCase";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await readJsonObject(request);

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.accept !== "boolean") {
    return NextResponse.json(
      { error: "accept must be a boolean." },
      { status: 400 },
    );
  }

  try {
    const caller = await requireCapability("schedule:view");

    if (!caller.ok) {
      return caller.response;
    }

    const respond = new RespondShiftSwapUseCase(new SupabaseShiftSwapRepository());

    return NextResponse.json(
      await respond.execute({ swapId: id, accept: body.accept }),
    );
  } catch (error) {
    const mapped = shiftWorkflowErrorResponse(error);

    if (mapped) {
      return mapped;
    }

    console.error("Failed to answer the shift swap", error);
    return NextResponse.json(
      { error: "Unable to answer the shift swap." },
      { status: 500 },
    );
  }
}
