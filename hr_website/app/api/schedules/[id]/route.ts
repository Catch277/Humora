/**
 * @swagger
 * /api/schedules/{id}:
 *   put:
 *     summary: Update a shift assignment
 *     description: Replaces the employee, branch, template, date, status and note of one assignment. Answers 409 on an overlap and 404 for an unknown or non-updatable row. Restricted to managers (`schedule:manage`, SCRUM-59). SCRUM-30.
 *     tags:
 *       - Schedules
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
 *             $ref: '#/components/schemas/ShiftAssignmentWriteRequest'
 *     responses:
 *       200:
 *         description: The updated shift assignment.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ShiftAssignment'
 *       400:
 *         description: The id is not a UUID, or the request body is invalid.
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
 *         description: The caller's role may not write the schedule (SCRUM-59), or they do not head the branch the shift belongs to (SCRUM-61).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: The assignment or the referenced shift template was not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: The employee already has an overlapping shift on that date.
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
 *   delete:
 *     summary: Delete a shift assignment
 *     description: Removes one assignment from the schedule. Restricted to managers (`schedule:manage`, SCRUM-59) and enforced by RLS. SCRUM-30.
 *     tags:
 *       - Schedules
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: The assignment was deleted.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - success
 *               properties:
 *                 success:
 *                   type: boolean
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
 *         description: The caller's role may not write the schedule (SCRUM-59), or they do not head the branch the shift belongs to (SCRUM-61).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: The assignment does not exist or is not deletable by the caller.
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

import { BranchForbiddenError } from "@/lib/domain/errors/BranchForbiddenError";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import { ShiftAssignmentNotFoundError } from "@/lib/domain/errors/ShiftAssignmentNotFoundError";
import { ShiftNotFoundError } from "@/lib/domain/errors/ShiftNotFoundError";
import { ShiftOverlapError } from "@/lib/domain/errors/ShiftOverlapError";
import { SupabaseBranchRepository } from "@/lib/infrastructure/repositories/SupabaseBranchRepository";
import { SupabaseShiftAssignmentRepository } from "@/lib/infrastructure/repositories/SupabaseShiftAssignmentRepository";
import { SupabaseShiftRepository } from "@/lib/infrastructure/repositories/SupabaseShiftRepository";
import { DeleteShiftAssignmentUseCase } from "@/lib/usecases/DeleteShiftAssignmentUseCase";
import { UpdateShiftAssignmentUseCase } from "@/lib/usecases/UpdateShiftAssignmentUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  UUID_PATTERN,
  parseScheduleRequest,
} from "@/app/api/schedules/_lib/scheduleRequest";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "The schedule id must be a UUID." },
      { status: 400 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseScheduleRequest(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const caller = await requireCapability("schedule:manage");

    if (!caller.ok) {
      return caller.response;
    }

    const updateAssignment = new UpdateShiftAssignmentUseCase(
      new SupabaseShiftAssignmentRepository(),
      new SupabaseShiftRepository(),
      new SupabaseBranchRepository(),
    );
    const assignment = await updateAssignment.execute(id, {
      ...parsed.input,
      // SCRUM-61: both the stored branch and the one it would move to have to be the caller's.
      callerId: caller.userId,
      callerRole: caller.role,
    });

    return NextResponse.json(assignment);
  } catch (error) {
    if (
      error instanceof ShiftAssignmentNotFoundError ||
      error instanceof ShiftNotFoundError
    ) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof ShiftOverlapError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof BranchForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof BranchNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Failed to update shift assignment", error);
    return NextResponse.json(
      { error: "Unable to update the shift assignment." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "The schedule id must be a UUID." },
      { status: 400 },
    );
  }

  try {
    const caller = await requireCapability("schedule:manage");

    if (!caller.ok) {
      return caller.response;
    }

    const deleteAssignment = new DeleteShiftAssignmentUseCase(
      new SupabaseShiftAssignmentRepository(),
      new SupabaseBranchRepository(),
    );
    await deleteAssignment.execute(id, {
      // SCRUM-61: the stored row's branch decides whether this manager may remove it.
      userId: caller.userId,
      role: caller.role,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ShiftAssignmentNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof BranchForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof BranchNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Failed to delete shift assignment", error);
    return NextResponse.json(
      { error: "Unable to delete the shift assignment." },
      { status: 500 },
    );
  }
}
