/**
 * @swagger
 * /api/organizations/invites/{id}:
 *   delete:
 *     summary: Revoke an organization invite
 *     description: |
 *       SCRUM-51: withdraws an invite that has not been claimed, so that address can no longer
 *       spend the join code. Removing somebody who already joined is a staff action instead
 *       (`is_active = false` on `/staff`). OWNER only (SCRUM-59); another organization's invite is a `404`.
 *     tags:
 *       - Organizations
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: The invite was revoked.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success]
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
 *         description: The account has no profile, or the role may not manage invites.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: The invite does not exist or belongs to another organization.
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
import { RevokeOrganizationInviteUseCase } from "@/lib/usecases/RevokeOrganizationInviteUseCase";
import { organizationErrorResponse } from "@/app/api/organizations/_lib/organizationErrorResponse";
import { requireCapability } from "@/app/api/_lib/requireCaller";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "The invite id must be a UUID." },
      { status: 400 },
    );
  }

  const caller = await requireCapability("organization:manage");

  if (!caller.ok) {
    return caller.response;
  }

  try {
    const revokeInvite = new RevokeOrganizationInviteUseCase(
      new SupabaseOrganizationInviteRepository(),
    );
    await revokeInvite.execute({ callerRole: caller.role, inviteId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    const mapped = organizationErrorResponse(error, "Failed to revoke invite");

    if (mapped) {
      return mapped;
    }

    return NextResponse.json(
      { error: "Unable to revoke the invite." },
      { status: 500 },
    );
  }
}