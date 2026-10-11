/**
 * @swagger
 * /api/facility-categories:
 *   get:
 *     summary: List the facility categories of the organization
 *     description: |
 *       The "Nhóm thiết bị" catalogue of the caller's organization (SCRUM-65): the six built-in groups
 *       SCRUM-45 shipped — Khu pha chế, Bảo quản lạnh, Nội thất, Thiết bị điện, Vệ sinh, Khác — plus any
 *       group the facilities tab has added since, sorted by name. `code` is what `facilities.category`
 *       stores; `name` is what the screen shows. Restricted to managers (`facility:manage`, SCRUM-59).
 *     tags:
 *       - Facilities
 *     responses:
 *       200:
 *         description: The category catalogue.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FacilityCategory'
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
 *     summary: Add a facility category
 *     description: |
 *       Adds one "Nhóm thiết bị" to the organization's catalogue (SCRUM-65), which is what the facilities
 *       tab does when an operator needs a group the six built-ins do not cover. Only the label is sent:
 *       the `code` stored in `facilities.category` is derived from it (diacritics stripped, uppercased,
 *       uniquified inside the organization). A name that already exists answers `409`. Restricted to
 *       managers (`facility:manage`, SCRUM-59) and enforced by RLS.
 *     tags:
 *       - Facilities
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FacilityCategoryWriteRequest'
 *     responses:
 *       201:
 *         description: The category was created.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FacilityCategory'
 *       400:
 *         description: The name is missing, not a string, or longer than 60 characters.
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
 *         description: The caller's role may not manage facilities (SCRUM-59).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: A category with that name already exists in the organization.
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

import { MAX_FACILITY_CATEGORY_NAME_LENGTH } from "@/lib/domain/entities/Facility";
import { FacilityCategoryExistsError } from "@/lib/domain/errors/FacilityCategoryExistsError";
import { FacilityCategoryInputError } from "@/lib/domain/errors/FacilityCategoryInputError";
import { SupabaseFacilityCategoryRepository } from "@/lib/infrastructure/repositories/SupabaseFacilityCategoryRepository";
import { CreateFacilityCategoryUseCase } from "@/lib/usecases/CreateFacilityCategoryUseCase";
import { ListFacilityCategoriesUseCase } from "@/lib/usecases/ListFacilityCategoriesUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";

export async function GET() {
  try {
    // The catalogue is part of the inventory view, so it needs exactly the capability the inventory needs.
    const caller = await requireCapability("facility:manage");

    if (!caller.ok) {
      return caller.response;
    }

    const listFacilityCategories = new ListFacilityCategoriesUseCase(
      new SupabaseFacilityCategoryRepository(),
    );

    return NextResponse.json(await listFacilityCategories.execute());
  } catch (error) {
    console.error("Failed to list facility categories", error);
    return NextResponse.json(
      { error: "Unable to retrieve facility categories." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: { name?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof body.name !== "string" ||
    body.name.trim() === "" ||
    body.name.trim().length > MAX_FACILITY_CATEGORY_NAME_LENGTH
  ) {
    return NextResponse.json(
      {
        error: `name is required and must be a non-empty string of at most ${MAX_FACILITY_CATEGORY_NAME_LENGTH} characters.`,
      },
      { status: 400 },
    );
  }

  try {
    const caller = await requireCapability("facility:manage");

    if (!caller.ok) {
      return caller.response;
    }

    const createFacilityCategory = new CreateFacilityCategoryUseCase(
      new SupabaseFacilityCategoryRepository(),
    );
    const category = await createFacilityCategory.execute({ name: body.name });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    if (error instanceof FacilityCategoryInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof FacilityCategoryExistsError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("Failed to create facility category", error);
    return NextResponse.json(
      { error: "Unable to create the facility category." },
      { status: 500 },
    );
  }
}
