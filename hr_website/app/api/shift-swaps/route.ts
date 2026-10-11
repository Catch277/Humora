/**
 * @swagger
 * components:
 *   schemas:
 *     ShiftSwap:
 *       type: object
 *       description: |
 *         Chuyển ca (SCRUM-23) — an employee hands an assigned shift to a colleague.
 *         PENDING (waiting for the colleague) → ACCEPTED (waiting for the manager) → APPROVED, or
 *         REJECTED / CANCELLED at any open step.
 *       properties:
 *         id: { type: string, format: uuid }
 *         branch_id: { type: string, format: uuid }
 *         assignment_id: { type: string, format: uuid }
 *         requester_id: { type: string, format: uuid }
 *         target_employee_id: { type: string, format: uuid }
 *         reason: { type: string, nullable: true }
 *         status: { type: string, enum: [PENDING, ACCEPTED, APPROVED, REJECTED, CANCELLED] }
 *         target_responded_at: { type: string, format: date-time, nullable: true }
 *         reviewed_by: { type: string, format: uuid, nullable: true }
 *         reviewed_at: { type: string, format: date-time, nullable: true }
 *         reject_reason: { type: string, nullable: true }
 *         created_at: { type: string, format: date-time }
 *         updated_at: { type: string, format: date-time }
 *         requester:
 *           type: object
 *           nullable: true
 *           properties:
 *             id: { type: string, format: uuid }
 *             full_name: { type: string }
 *         target_employee:
 *           type: object
 *           nullable: true
 *           properties:
 *             id: { type: string, format: uuid }
 *             full_name: { type: string }
 *         assignment:
 *           type: object
 *           nullable: true
 *           properties:
 *             id: { type: string, format: uuid }
 *             work_date: { type: string, format: date }
 *             shift:
 *               nullable: true
 *               allOf:
 *                 - $ref: '#/components/schemas/Shift'
 */

/**
 * @swagger
 * /api/shift-swaps:
 *   get:
 *     summary: List shift swaps
 *     description: |
 *       A manager sees the swaps of their organization, narrowed by the filters. An employee sees only
 *       the swaps they sent or were asked to take.
 *     tags:
 *       - Shift swaps
 *     parameters:
 *       - { in: query, name: branch_id, schema: { type: string, format: uuid } }
 *       - { in: query, name: status, schema: { type: string, enum: [PENDING, ACCEPTED, APPROVED, REJECTED, CANCELLED] } }
 *     responses:
 *       200:
 *         description: The swaps, newest first.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ShiftSwap'
 *       400:
 *         description: A filter is malformed.
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
 *       500:
 *         description: An unexpected server error occurred.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   post:
 *     summary: Offer one of your shifts to a colleague
 *     description: |
 *       Chuyển ca, step 1. The shift must be the caller's own, `SCHEDULED`, not in the past and
 *       without an attendance record; the colleague an active employee of the same branch with no
 *       leave, same shift or overlapping hours that day. The database checks all of it.
 *     tags:
 *       - Shift swaps
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [assignment_id, target_employee_id]
 *             properties:
 *               assignment_id: { type: string, format: uuid }
 *               target_employee_id: { type: string, format: uuid }
 *               reason: { type: string, nullable: true, maxLength: 300 }
 *     responses:
 *       201:
 *         description: The swap, `PENDING` until the colleague answers.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ShiftSwap'
 *       400:
 *         description: The body is invalid, or the colleague is not eligible.
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
 *         description: No such shift among the caller's own.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: The shift cannot be handed over now, or the colleague's schedule clashes, or a swap is already open.
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
  UUID_PATTERN,
} from "@/app/api/_lib/shiftWorkflow";
import {
  isShiftSwapStatus,
  type ShiftSwapFilters,
} from "@/lib/domain/entities/ShiftSwap";
import { SupabaseShiftSwapRepository } from "@/lib/infrastructure/repositories/SupabaseShiftSwapRepository";
import { ListShiftSwapsUseCase } from "@/lib/usecases/ListShiftSwapsUseCase";
import { RequestShiftSwapUseCase } from "@/lib/usecases/RequestShiftSwapUseCase";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const filters: ShiftSwapFilters = {};
  const branchId = params.get("branch_id");
  const status = params.get("status");

  if (branchId) {
    if (!UUID_PATTERN.test(branchId)) {
      return NextResponse.json(
        { error: "branch_id must be a UUID." },
        { status: 400 },
      );
    }

    filters.branchId = branchId;
  }

  if (status) {
    if (!isShiftSwapStatus(status)) {
      return NextResponse.json(
        { error: "status is not a valid swap status." },
        { status: 400 },
      );
    }

    filters.status = status;
  }

  try {
    const caller = await requireCapability("schedule:view");

    if (!caller.ok) {
      return caller.response;
    }

    const list = new ListShiftSwapsUseCase(new SupabaseShiftSwapRepository());

    return NextResponse.json(
      await list.execute({
        filters,
        callerId: caller.userId,
        callerRole: caller.role,
      }),
    );
  } catch (error) {
    console.error("Failed to list shift swaps", error);
    return NextResponse.json(
      { error: "Unable to list the shift swaps." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const reason = optionalString(body.reason);

  if (
    typeof body.assignment_id !== "string" ||
    typeof body.target_employee_id !== "string"
  ) {
    return NextResponse.json(
      { error: "assignment_id and target_employee_id are required strings." },
      { status: 400 },
    );
  }

  if (reason === undefined) {
    return NextResponse.json(
      { error: "reason must be a string or null." },
      { status: 400 },
    );
  }

  try {
    const caller = await requireCapability("schedule:view");

    if (!caller.ok) {
      return caller.response;
    }

    const requestSwap = new RequestShiftSwapUseCase(
      new SupabaseShiftSwapRepository(),
    );
    const swap = await requestSwap.execute({
      assignmentId: body.assignment_id,
      targetEmployeeId: body.target_employee_id,
      reason,
      callerId: caller.userId,
    });

    return NextResponse.json(swap, { status: 201 });
  } catch (error) {
    const mapped = shiftWorkflowErrorResponse(error);

    if (mapped) {
      return mapped;
    }

    console.error("Failed to request the shift swap", error);
    return NextResponse.json(
      { error: "Unable to request the shift swap." },
      { status: 500 },
    );
  }
}
