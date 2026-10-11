/**
 * @swagger
 * /api/facilities/{id}:
 *   put:
 *     summary: Update a facility
 *     description: Replaces the editable fields of one facility. Restricted to managers (`facility:manage`, SCRUM-59) and enforced by RLS; a hidden or unknown id answers 404. SCRUM-45. SCRUM-67 — the request must not carry a `code`; the stored tag is kept while it still matches the branch, and a facility moved to another branch (or one holding a legacy code) is given a fresh tag for the branch it lands in.
 *     tags:
 *       - Facilities
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
 *             $ref: '#/components/schemas/FacilityWriteRequest'
 *     responses:
 *       200:
 *         description: The updated facility.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Facility'
 *       400:
 *         description: The id is not a UUID, or the request body is invalid (including a `code`, which is generated — SCRUM-67).
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
 *         description: The caller's role may not manage facilities (SCRUM-59), or they do not head that branch (SCRUM-61).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: The facility does not exist or is not updatable by the caller.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: The asset code is already used by another facility of the organization (SCRUM-66).
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
 *     summary: Delete a facility
 *     description: Removes one facility from the registry. Restricted to managers (`facility:manage`, SCRUM-59) and enforced by RLS. SCRUM-45.
 *     tags:
 *       - Facilities
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: The facility was deleted.
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
 *         description: The caller's role may not manage facilities (SCRUM-59), or they do not head that branch (SCRUM-61).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: The facility does not exist or is not deletable by the caller.
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
import { FacilityCategoryNotFoundError } from "@/lib/domain/errors/FacilityCategoryNotFoundError";
import { FacilityCodeConflictError } from "@/lib/domain/errors/FacilityCodeConflictError";
import { FacilityNotFoundError } from "@/lib/domain/errors/FacilityNotFoundError";
import { SupabaseBranchRepository } from "@/lib/infrastructure/repositories/SupabaseBranchRepository";
import { SupabaseFacilityRepository } from "@/lib/infrastructure/repositories/SupabaseFacilityRepository";
import { DeleteFacilityUseCase } from "@/lib/usecases/DeleteFacilityUseCase";
import { UpdateFacilityUseCase } from "@/lib/usecases/UpdateFacilityUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import { UUID_PATTERN, parseFacilityRequest } from "@/app/api/facilities/_lib/facilityRequest";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "The facility id must be a UUID." },
      { status: 400 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseFacilityRequest(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const caller = await requireCapability("facility:manage");

    if (!caller.ok) {
      return caller.response;
    }

    const updateFacility = new UpdateFacilityUseCase(
      new SupabaseFacilityRepository(),
      new SupabaseBranchRepository(),
    );
    const facility = await updateFacility.execute(id, {
      ...parsed.input,
      // SCRUM-61: the stored branch and the destination both have to be the caller's.
      callerId: caller.userId,
      callerRole: caller.role,
    });

    return NextResponse.json(facility);
  } catch (error) {
    if (error instanceof BranchForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof BranchNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof FacilityNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    // SCRUM-65: the category is no longer a fixed list, so "unknown group" is a `400` the operator can
    // fix by reloading the form rather than a `500` from the foreign key.
    if (error instanceof FacilityCategoryNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // SCRUM-66/67: `code` is unique per organization; a generated tag only reaches this through a race
    // between two saves, so the answer is `409` (retry), never a `500`.
    if (error instanceof FacilityCodeConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("Failed to update facility", error);
    return NextResponse.json(
      { error: "Unable to update facility." },
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
      { error: "The facility id must be a UUID." },
      { status: 400 },
    );
  }

  try {
    const caller = await requireCapability("facility:manage");

    if (!caller.ok) {
      return caller.response;
    }

    const deleteFacility = new DeleteFacilityUseCase(
      new SupabaseFacilityRepository(),
      new SupabaseBranchRepository(),
    );
    await deleteFacility.execute(id, {
      // SCRUM-61: the stored row's branch decides whether this manager may retire it.
      userId: caller.userId,
      role: caller.role,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof BranchForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof BranchNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof FacilityNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Failed to delete facility", error);
    return NextResponse.json(
      { error: "Unable to delete facility." },
      { status: 500 },
    );
  }
}
