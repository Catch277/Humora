/**
 * @swagger
 * /api/organizations/invites:
 *   get:
 *     summary: List the organization's invites
 *     description: |
 *       SCRUM-51: the register of accounts the organization knows — both `invite` rows (an owner
 *       asked an existing account to join) and `provisioned` rows (an owner created the account and
 *       handed over a temporary password, SCRUM-52). `claimed_at` says whether the person has
 *       joined. OWNER only (SCRUM-59 `organization:manage`); RLS hides other organizations' rows.
 *     tags:
 *       - Organizations
 *     responses:
 *       200:
 *         description: The invites, newest first.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/OrganizationInvite'
 *       401:
 *         description: Authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: The account has no profile, or the role may not manage invites.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: The caller does not belong to an organization.
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
 *     summary: Invite an existing account to the organization
 *     description: |
 *       SCRUM-51: puts an email on the organization's register. The person keeps their own password
 *       (this is the path for somebody who already signed up); the invite is what makes the join
 *       code usable for them, and `role` is capped at `MANAGER` — an invite never mints an OWNER.
 *     tags:
 *       - Organizations
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               full_name:
 *                 type: string
 *                 maxLength: 120
 *                 nullable: true
 *               role:
 *                 type: string
 *                 enum: [EMPLOYEE, MANAGER]
 *                 default: EMPLOYEE
 *     responses:
 *       201:
 *         description: The invite was created.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrganizationInvite'
 *       400:
 *         description: The JSON body is invalid, the email is malformed, or the role/full name failed validation.
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
 *         description: The account has no profile, or the role may not manage invites.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: The caller does not belong to an organization.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: That email is already on the organization's list.
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

import { SupabaseOrganizationInviteRepository } from "@/lib/infrastructure/repositories/SupabaseOrganizationInviteRepository";
import { SupabaseOrganizationRepository } from "@/lib/infrastructure/repositories/SupabaseOrganizationRepository";
import { CreateOrganizationInviteUseCase } from "@/lib/usecases/CreateOrganizationInviteUseCase";
import { ListOrganizationInvitesUseCase } from "@/lib/usecases/ListOrganizationInvitesUseCase";
import { organizationErrorResponse } from "@/app/api/organizations/_lib/organizationErrorResponse";
import { requireCapability } from "@/app/api/_lib/requireCaller";

export async function GET() {
  // Invites are the owner's business (SCRUM-59): a manager runs the operation, not the roster.
  const caller = await requireCapability("organization:manage");

  if (!caller.ok) {
    return caller.response;
  }

  try {
    const listInvites = new ListOrganizationInvitesUseCase(
      new SupabaseOrganizationRepository(),
      new SupabaseOrganizationInviteRepository(),
    );
    const invites = await listInvites.execute({ callerRole: caller.role });

    return NextResponse.json(invites);
  } catch (error) {
    const mapped = organizationErrorResponse(error, "Failed to load invites");

    if (mapped) {
      return mapped;
    }

    return NextResponse.json(
      { error: "Unable to retrieve the invites." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: { email?: unknown; full_name?: unknown; role?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.email !== "string") {
    return NextResponse.json(
      { error: "email is required and must be a string." },
      { status: 400 },
    );
  }

  if (
    body.full_name !== undefined &&
    body.full_name !== null &&
    typeof body.full_name !== "string"
  ) {
    return NextResponse.json(
      { error: "full_name must be a string or null." },
      { status: 400 },
    );
  }

  const role = body.role ?? "EMPLOYEE";

  if (typeof role !== "string") {
    return NextResponse.json({ error: "role must be a string." }, { status: 400 });
  }

  const caller = await requireCapability("organization:manage");

  if (!caller.ok) {
    return caller.response;
  }

  try {
    const createInvite = new CreateOrganizationInviteUseCase(
      new SupabaseOrganizationRepository(),
      new SupabaseOrganizationInviteRepository(),
    );
    const invite = await createInvite.execute({
      callerId: caller.userId,
      callerRole: caller.role,
      email: body.email,
      fullName: typeof body.full_name === "string" ? body.full_name : null,
      role,
    });

    return NextResponse.json(invite, { status: 201 });
  } catch (error) {
    const mapped = organizationErrorResponse(error, "Failed to create invite");

    if (mapped) {
      return mapped;
    }

    return NextResponse.json(
      { error: "Unable to create the invite." },
      { status: 500 },
    );
  }
}
