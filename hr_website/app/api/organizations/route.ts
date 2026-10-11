/**
 * @swagger
 * /api/organizations:
 *   post:
 *     summary: Create an organization
 *     description: |
 *       SCRUM-51: creates the organization of the signed-in account and makes the caller its OWNER.
 *       Registering no longer grants any role — ownership comes from creating an organization here.
 *       The organization receives the join code that colleagues spend (together with an invite on
 *       file) to join it.
 *     tags:
 *       - Organizations
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 120
 *                 example: Humora Coffee
 *     responses:
 *       201:
 *         description: The organization was created and the caller is its OWNER.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Organization'
 *       400:
 *         description: The JSON body is invalid, or the name is shorter than 2 or longer than 120 characters.
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
 *         description: The account has no user profile.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: The account already belongs to an organization.
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

import { SupabaseOrganizationRepository } from "@/lib/infrastructure/repositories/SupabaseOrganizationRepository";
import { CreateOrganizationUseCase } from "@/lib/usecases/CreateOrganizationUseCase";
import { organizationErrorResponse } from "@/app/api/organizations/_lib/organizationErrorResponse";
import { requireCaller } from "@/app/api/_lib/requireCaller";

export async function POST(request: Request) {
  let body: { name?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.name !== "string") {
    return NextResponse.json(
      { error: "name is required and must be a string." },
      { status: 400 },
    );
  }

  const caller = await requireCaller();

  if (!caller.ok) {
    return caller.response;
  }

  try {
    const createOrganization = new CreateOrganizationUseCase(
      new SupabaseOrganizationRepository(),
    );
    const organization = await createOrganization.execute({ name: body.name });

    return NextResponse.json(organization, { status: 201 });
  } catch (error) {
    const mapped = organizationErrorResponse(error, "Failed to create organization");

    if (mapped) {
      return mapped;
    }

    return NextResponse.json(
      { error: "Unable to create the organization." },
      { status: 500 },
    );
  }
}