/**
 * @swagger
 * /api/facilities:
 *   get:
 *     summary: List facilities
 *     description: Returns the per-branch facilities visible to the authenticated caller under the active RLS policy, sorted by name. SCRUM-45.
 *     tags:
 *       - Facilities
 *     parameters:
 *       - in: query
 *         name: branch_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Restrict the list to one branch.
 *     responses:
 *       200:
 *         description: The facility list.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Facility'
 *       400:
 *         description: branch_id is not a UUID.
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
 *         description: The caller's role may not read the inventory (SCRUM-59, manager and above).
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
 *     summary: Create a facility
 *     description: Registers one facility of a branch. Restricted to managers (`facility:manage`, SCRUM-59) and enforced by RLS. SCRUM-67 — the asset code is generated from the branch (`{số chi nhánh}{viết tắt chi nhánh}-{số}`, e.g. `01HSVH-0001`, then `-0002`) and the field is read-only in the UI, so a body that sends a non-empty `code` answers `400`.
 *     tags:
 *       - Facilities
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FacilityWriteRequest'
 *     responses:
 *       201:
 *         description: The facility was created.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Facility'
 *       400:
 *         description: The request body is invalid, it sends a `code` (SCRUM-67), or `category` is not one of the organization's facility categories (SCRUM-65).
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
 *       404:
 *         description: The branch does not exist or is not visible to the caller.
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
 */
import { NextResponse, type NextRequest } from "next/server";

import { BranchForbiddenError } from "@/lib/domain/errors/BranchForbiddenError";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import { FacilityCategoryNotFoundError } from "@/lib/domain/errors/FacilityCategoryNotFoundError";
import { FacilityCodeConflictError } from "@/lib/domain/errors/FacilityCodeConflictError";
import { SupabaseBranchRepository } from "@/lib/infrastructure/repositories/SupabaseBranchRepository";
import { SupabaseFacilityRepository } from "@/lib/infrastructure/repositories/SupabaseFacilityRepository";
import { CreateFacilityUseCase } from "@/lib/usecases/CreateFacilityUseCase";
import { ListFacilitiesUseCase } from "@/lib/usecases/ListFacilitiesUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import { UUID_PATTERN, parseFacilityRequest } from "@/app/api/facilities/_lib/facilityRequest";

export async function GET(request: NextRequest) {
  const branchId = request.nextUrl.searchParams.get("branch_id") ?? undefined;

  if (branchId && !UUID_PATTERN.test(branchId)) {
    return NextResponse.json(
      { error: "branch_id must be a UUID." },
      { status: 400 },
    );
  }

  try {
    // The inventory is a management view (SCRUM-59): the guard answers 403 for an employee and
    // `facilities_select_authenticated` narrows the rows in the database as well.
    const caller = await requireCapability("facility:manage");

    if (!caller.ok) {
      return caller.response;
    }

    const listFacilities = new ListFacilitiesUseCase(
      new SupabaseFacilityRepository(),
    );
    const facilities = await listFacilities.execute({ branchId });

    return NextResponse.json(facilities);
  } catch (error) {
    console.error("Failed to list facilities", error);
    return NextResponse.json(
      { error: "Unable to retrieve facilities." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
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

    const createFacility = new CreateFacilityUseCase(
      new SupabaseFacilityRepository(),
      new SupabaseBranchRepository(),
    );
    const facility = await createFacility.execute({
      ...parsed.input,
      // SCRUM-61: the inventory belongs to a branch, so the caller has to head it.
      callerId: caller.userId,
      callerRole: caller.role,
    });

    return NextResponse.json(facility, { status: 201 });
  } catch (error) {
    if (error instanceof BranchForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof BranchNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    // SCRUM-65: the category comes from the organization's catalogue, so an unknown one is the caller's
    // input problem (a stale form or a hand-made body) — `400`, not the foreign key's `500`.
    if (error instanceof FacilityCategoryNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // SCRUM-66/67: the asset code is unique per organization. A generated code only lands here through
    // the race between two saves that picked the same number at the same moment, which is not a server
    // failure but a retry — so the caller reads `409`, not `500`.
    if (error instanceof FacilityCodeConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("Failed to create facility", error);
    return NextResponse.json(
      { error: "Unable to create facility." },
      { status: 500 },
    );
  }
}
