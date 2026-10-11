/**
 * @swagger
 * /api/organizations/current:
 *   get:
 *     summary: Get the caller's organization
 *     description: |
 *       SCRUM-51: the organization of the signed-in account plus its member and pending-invite
 *       counts. `organization` is null while the caller has not created or joined one, which is
 *       what the onboarding gate uses. `code` is null unless the caller is the organization's OWNER
 *       (SCRUM-59) — the join code is hidden by RLS, not by a check here.
 *     tags:
 *       - Organizations
 *     responses:
 *       200:
 *         description: The organization summary (organization may be null).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrganizationSummary'
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
 *       500:
 *         description: An unexpected server error occurred.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   patch:
 *     summary: Rename the organization or rotate its join code
 *     description: |
 *       SCRUM-51 + SCRUM-59: both `name` (rename) and `rotate_code: true` are owner actions
 *       (`organization:manage`), so a `MANAGER` gets `403`. The old code stops working immediately,
 *       which is how an owner cuts off a code that leaked without touching the invites of the
 *       people they meant to add.
 *     tags:
 *       - Organizations
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 120
 *               rotate_code:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: The updated organization summary.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrganizationSummary'
 *       400:
 *         description: The JSON body is invalid, nothing was asked for, or the name failed validation.
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
 *         description: The account has no profile, or the caller is not the organization's OWNER (SCRUM-59).
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
 */
import { NextResponse } from "next/server";

import { SupabaseOrganizationInviteRepository } from "@/lib/infrastructure/repositories/SupabaseOrganizationInviteRepository";
import { SupabaseOrganizationRepository } from "@/lib/infrastructure/repositories/SupabaseOrganizationRepository";
import { GetCurrentOrganizationUseCase } from "@/lib/usecases/GetCurrentOrganizationUseCase";
import { RenameOrganizationUseCase } from "@/lib/usecases/RenameOrganizationUseCase";
import { RotateOrganizationCodeUseCase } from "@/lib/usecases/RotateOrganizationCodeUseCase";
import { organizationErrorResponse } from "@/app/api/organizations/_lib/organizationErrorResponse";
import { requireCaller, requireCapability } from "@/app/api/_lib/requireCaller";

export async function GET() {
  const caller = await requireCaller();

  if (!caller.ok) {
    return caller.response;
  }

  try {
    const getCurrent = new GetCurrentOrganizationUseCase(
      new SupabaseOrganizationRepository(),
      new SupabaseOrganizationInviteRepository(),
    );
    const summary = await getCurrent.execute();

    return NextResponse.json(summary);
  } catch (error) {
    console.error("Failed to load organization", error);
    return NextResponse.json(
      { error: "Unable to retrieve the organization." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  let body: { name?: unknown; rotate_code?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.name !== undefined && typeof body.name !== "string") {
    return NextResponse.json({ error: "name must be a string." }, { status: 400 });
  }

  const wantsRename = typeof body.name === "string";
  const wantsRotation = body.rotate_code === true;

  if (!wantsRename && !wantsRotation) {
    return NextResponse.json(
      { error: "Send name, rotate_code, or both." },
      { status: 400 },
    );
  }

  // Renaming the organization or rotating its join code is the owner's own decision (SCRUM-59); the
  // use cases repeat the rule for the caller they are given and SCRUM-51's policies repeat it in the
  // database.
  const caller = await requireCapability("organization:manage");

  if (!caller.ok) {
    return caller.response;
  }

  try {
    const organizationRepository = new SupabaseOrganizationRepository();

    if (wantsRename) {
      const renameOrganization = new RenameOrganizationUseCase(
        organizationRepository,
      );
      await renameOrganization.execute({
        callerRole: caller.role,
        name: body.name as string,
      });
    }

    if (wantsRotation) {
      const rotateCode = new RotateOrganizationCodeUseCase(organizationRepository);
      await rotateCode.execute({ callerRole: caller.role });
    }

    // One read at the end: the screen always renders the code that is valid right now.
    const getCurrent = new GetCurrentOrganizationUseCase(
      organizationRepository,
      new SupabaseOrganizationInviteRepository(),
    );
    const summary = await getCurrent.execute();

    return NextResponse.json(summary);
  } catch (error) {
    const mapped = organizationErrorResponse(error, "Failed to update organization");

    if (mapped) {
      return mapped;
    }

    return NextResponse.json(
      { error: "Unable to update the organization." },
      { status: 500 },
    );
  }
}
