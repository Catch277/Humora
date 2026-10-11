/**
 * @swagger
 * /api/organizations/accounts/password:
 *   post:
 *     summary: Give a member a new temporary password
 *     description: |
 *       SCRUM-52: for the case where the owner no longer has the temporary password they handed
 *       over. Only accounts inside the caller's own organization are accepted (the Edge Function
 *       checks this with the service client); the member must choose a new password on next
 *       sign-in.
 *     tags:
 *       - Organizations
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, password]
 *             properties:
 *               user_id:
 *                 type: string
 *                 format: uuid
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: The password was replaced.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StaffProvisionResult'
 *       400:
 *         description: The JSON body is invalid, or a field failed validation.
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
 *         description: No profile, no organization, a role that may not manage accounts, or another organization's member.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many attempts for this organization in the last hour.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: The staff account Edge Function is not deployed (or not reachable).
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

import { EdgeFunctionStaffProvisioningService } from "@/lib/infrastructure/EdgeFunctionStaffProvisioningService";
import { organizationErrorResponse } from "@/app/api/organizations/_lib/organizationErrorResponse";
import { requireCapability } from "@/app/api/_lib/requireCaller";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: Request) {
  let body: { user_id?: unknown; password?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.user_id !== "string" || !UUID_PATTERN.test(body.user_id)) {
    return NextResponse.json(
      { error: "user_id must be a UUID." },
      { status: 400 },
    );
  }

  if (typeof body.password !== "string") {
    return NextResponse.json(
      { error: "password is required and must be a string." },
      { status: 400 },
    );
  }

  if (body.password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 },
    );
  }

  // Handing out temporary passwords is the owner's own action (SCRUM-59).
  const caller = await requireCapability("organization:manage");

  if (!caller.ok) {
    return caller.response;
  }

  try {
    const service = new EdgeFunctionStaffProvisioningService();
    const result = await service.resetPassword({
      callerToken: caller.accessToken,
      userId: body.user_id,
      password: body.password,
    });

    return NextResponse.json(result);
  } catch (error) {
    const mapped = organizationErrorResponse(error, "Failed to reset staff password");

    if (mapped) {
      return mapped;
    }

    return NextResponse.json(
      { error: "Unable to reset the password." },
      { status: 500 },
    );
  }
}