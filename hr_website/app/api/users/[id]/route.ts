/**
 * @swagger
 * /api/users/{id}:
 *   patch:
 *     summary: Change a staff member's role or employment state
 *     description: |
 *       SCRUM-24: gives an account a different role (`OWNER`, `MANAGER`, `EMPLOYEE`) or marks it as
 *       left/returned (`is_active`). SCRUM-59 makes this an owner-only action — a manager runs the
 *       operation but does not hand out accounts; only an `OWNER` may grant or revoke the `OWNER`
 *       role, and nobody may change their own role or deactivate themselves.
 *     tags:
 *       - Users
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
 *             type: object
 *             required:
 *               - role
 *               - is_active
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [OWNER, MANAGER, EMPLOYEE]
 *               is_active:
 *                 type: boolean
 *                 description: false means the account has left the company.
 *               branch_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: "Chi nhánh làm việc của tài khoản (SCRUM-63, chỉ chủ sở hữu). Bỏ trống là giữ nguyên chi nhánh hiện tại; `null` là tháo gán. `400` khi tài khoản là chủ sở hữu: chủ sở hữu đứng trên mọi chi nhánh nên không thuộc một chi nhánh cụ thể. Một nhân viên chưa gán chi nhánh thì không đọc được dữ liệu nào theo chi nhánh và không gửi được đơn."
 *     responses:
 *       200:
 *         description: The updated staff member.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StaffMember'
 *       400:
 *         description: The id is not a UUID, the body is invalid, the branch_id names no branch in your organization or is set on the organization's OWNER (SCRUM-63), or the change would lock the caller out.
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
 *         description: The caller has no profile, is not the organization's OWNER, or tried to touch the OWNER role.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: The account does not exist or is not updatable by the caller.
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

import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import { StaffForbiddenError } from "@/lib/domain/errors/StaffForbiddenError";
import { StaffNotFoundError } from "@/lib/domain/errors/StaffNotFoundError";
import { APP_ROLES, type AppRole } from "@/lib/domain/roles";
import { SupabaseBranchRepository } from "@/lib/infrastructure/repositories/SupabaseBranchRepository";
import { SupabaseUserRepository } from "@/lib/infrastructure/repositories/SupabaseUserRepository";
import { UpdateStaffUseCase } from "@/lib/usecases/UpdateStaffUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ROLE_SET: ReadonlySet<string> = new Set(APP_ROLES);

type StaffRequestBody = {
  role?: unknown;
  is_active?: unknown;
  branch_id?: unknown;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "The user id must be a UUID." },
      { status: 400 },
    );
  }

  let body: StaffRequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.role !== "string" || !ROLE_SET.has(body.role)) {
    return NextResponse.json(
      { error: `role must be one of ${APP_ROLES.join(", ")}.` },
      { status: 400 },
    );
  }

  if (typeof body.is_active !== "boolean") {
    return NextResponse.json(
      { error: "is_active must be a boolean." },
      { status: 400 },
    );
  }

  // SCRUM-63: optional, and the screen clears it with `value || null`, so an omitted field and an
  // explicit `null` are both valid. Omitted keeps the branch the account already has (a client that
  // predates this column sends only `role`/`is_active`); `null` tháo gán.
  if (
    body.branch_id !== undefined &&
    body.branch_id !== null &&
    (typeof body.branch_id !== "string" || !UUID_PATTERN.test(body.branch_id))
  ) {
    return NextResponse.json(
      { error: "branch_id must be a UUID or null." },
      { status: 400 },
    );
  }

  const branchId: string | null | undefined =
    typeof body.branch_id === "string"
      ? body.branch_id
      : body.branch_id === null
        ? null
        : undefined;

  try {
    // Handing out accounts is the organization owner's decision (SCRUM-59): a manager runs the
    // operation but does not create or re-role staff. `UpdateStaffUseCase` repeats the rule for the
    // caller it is given, and `users_update_managers` repeats it in the database.
    const caller = await requireCapability("staff:manage");

    if (!caller.ok) {
      return caller.response;
    }

    const updateStaff = new UpdateStaffUseCase(
      new SupabaseUserRepository(),
      new SupabaseBranchRepository(),
    );
    const staff = await updateStaff.execute({
      staffId: id,
      role: body.role as AppRole,
      isActive: body.is_active,
      branchId,
      callerId: caller.userId,
      callerRole: caller.role,
    });

    return NextResponse.json(staff);
  } catch (error) {
    if (error instanceof StaffNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof StaffForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    // The payload named a branch this caller cannot see, so it is a bad request rather than a
    // missing resource: nothing about the target account is wrong (SCRUM-63).
    if (error instanceof BranchNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (
      error instanceof Error &&
      (error.message.startsWith("role must") ||
        error.message.startsWith("You cannot change your own role") ||
        error.message.startsWith("You cannot assign a branch"))
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to update staff member", error);
    return NextResponse.json(
      { error: "Unable to update the staff member." },
      { status: 500 },
    );
  }
}