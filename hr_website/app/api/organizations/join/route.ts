/**
 * @swagger
 * /api/organizations/join:
 *   post:
 *     summary: Join an organization with its code
 *     description: |
 *       SCRUM-51: joins the caller's account to the organization that owns the code. Two things
 *       must be true, and the database checks both: the code must match `organization_join_codes`,
 *       and the caller's email must be on that organization's register (`organization_invites`) and
 *       unclaimed. An outsider who obtains the code therefore gets `403` — this is the point of the
 *       invite list. Ten failed attempts per hour are refused with `429`. A `MANAGER` invite grants
 *       the manager role; an invite can never mint an OWNER.
 *     tags:
 *       - Organizations
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 example: K7QM2XPD
 *     responses:
 *       200:
 *         description: Joined. Answers the same summary as `/api/organizations/current`.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrganizationSummary'
 *       400:
 *         description: The JSON body is invalid, or the code is not a plausible code.
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
 *         description: No profile, a wrong code, or an account that organization did not register.
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
 *       429:
 *         description: Too many failed attempts in the last hour.
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
import { GetCurrentOrganizationUseCase } from "@/lib/usecases/GetCurrentOrganizationUseCase";
import { JoinOrganizationUseCase } from "@/lib/usecases/JoinOrganizationUseCase";
import { organizationErrorResponse } from "@/app/api/organizations/_lib/organizationErrorResponse";
import { requireCaller } from "@/app/api/_lib/requireCaller";

export async function POST(request: Request) {
  let body: { code?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.code !== "string") {
    return NextResponse.json(
      { error: "code is required and must be a string." },
      { status: 400 },
    );
  }

  const caller = await requireCaller();

  if (!caller.ok) {
    return caller.response;
  }

  try {
    const organizationRepository = new SupabaseOrganizationRepository();
    const joinOrganization = new JoinOrganizationUseCase(organizationRepository);

    await joinOrganization.execute({ code: body.code });

    // Same shape as GET /api/organizations/current, so the screen can paint the organization
    // (and, for the owner, the code) without a second round trip.
    const getCurrent = new GetCurrentOrganizationUseCase(
      organizationRepository,
      new SupabaseOrganizationInviteRepository(),
    );
    const summary = await getCurrent.execute();

    return NextResponse.json(summary);
  } catch (error) {
    const mapped = organizationErrorResponse(error, "Failed to join organization");

    if (mapped) {
      return mapped;
    }

    return NextResponse.json(
      { error: "Unable to join the organization." },
      { status: 500 },
    );
  }
}