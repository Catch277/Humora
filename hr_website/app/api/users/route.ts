/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Look up a user, or list the staff directory
 *     description: |
 *       With `?id=<uuid>` returns that profile (id, full name, role). Without `id` returns the
 *       whole staff directory (SCRUM-24) including `is_active`, which only a manager
 *       (OWNER/MANAGER) may read — SCRUM-59 `directory:view`.
 *     tags:
 *       - Users
 *     parameters:
 *       - in: query
 *         name: id
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The user's UUID. Omit it to list the staff directory.
 *     responses:
 *       200:
 *         description: The requested user, or the staff directory.
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/User'
 *                 - type: array
 *                   items:
 *                     $ref: '#/components/schemas/StaffMember'
 *       400:
 *         description: The id query parameter is not a UUID.
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
 *         description: The caller has no user profile, or is not allowed to read the directory.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No user exists with the supplied ID.
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
import { type NextRequest, NextResponse } from "next/server";

import { StaffForbiddenError } from "@/lib/domain/errors/StaffForbiddenError";
import { SupabaseUserRepository } from "@/lib/infrastructure/repositories/SupabaseUserRepository";
import { GetUserUseCase } from "@/lib/usecases/GetUserUseCase";
import { ListStaffUseCase } from "@/lib/usecases/ListStaffUseCase";
import { requireCaller, requireCapability } from "@/app/api/_lib/requireCaller";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");

  if (id && !UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "The id query parameter must be a UUID." },
      { status: 400 },
    );
  }

  try {
    if (id) {
      // A single profile is what every screen needs to render a name, so any signed-in member may
      // look one up; the row itself still has to satisfy the `users` SELECT policy.
      const caller = await requireCaller();

      if (!caller.ok) {
        return caller.response;
      }

      const getUser = new GetUserUseCase(new SupabaseUserRepository());
      const profile = await getUser.execute(id);

      if (!profile) {
        return NextResponse.json({ error: "User not found." }, { status: 404 });
      }

      return NextResponse.json(profile);
    }

    // No id: the staff directory. Reading it is a management view (SCRUM-59) — the shift and branch
    // pickers need it, while a plain employee has `/api/search` for the same names.
    const caller = await requireCapability("directory:view");

    if (!caller.ok) {
      return caller.response;
    }

    const listStaff = new ListStaffUseCase(new SupabaseUserRepository());
    const staff = await listStaff.execute({ callerRole: caller.role });

    return NextResponse.json(staff);
  } catch (error) {
    if (error instanceof StaffForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("Failed to load users", error);
    return NextResponse.json(
      { error: "Unable to retrieve users." },
      { status: 500 },
    );
  }
}