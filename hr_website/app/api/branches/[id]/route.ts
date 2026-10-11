/**
 * @swagger
 * /api/branches/{id}:
 *   put:
 *     summary: Update a branch
 *     description: |-
 *       Replaces the editable fields of one branch (name, address, manager, GPS geofence). SCRUM-59 made
 *       this an owner action; SCRUM-61 extends it to the **chi nhánh trưởng** of that very branch
 *       (`branch:update`), who manages only their own — editing another branch answers `403`. Only the
 *       organization's OWNER may change `manager_id`, because that field is what grants a manager their
 *       scope. RLS repeats both rules (`public.heads_branch()` / `branches_guard_manager_change`).
 *     tags:
 *       - Branches
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The branch UUID.
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
 *               address:
 *                 type: string
 *                 maxLength: 300
 *                 nullable: true
 *               manager_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: "Chi nhánh trưởng — `public.users.id` của một tài khoản OWNER/MANAGER trong tổ chức của bạn; null để bỏ gán. `400` khi id không trỏ tới tài khoản nào mà bạn nhìn thấy được, hoặc trỏ tới một nhân viên (SCRUM-61)."
 *               latitude:
 *                 type: number
 *                 minimum: 8.5436
 *                 maximum: 23.3883
 *                 nullable: true
 *                 description: "Vĩ độ; phải nằm trên lãnh thổ Việt Nam — kiểm tra theo đường bờ biển thật (lib/geo/vietnamOutline.ts), không chỉ theo khung 8.5436–23.3883° N."
 *               longitude:
 *                 type: number
 *                 minimum: 102.0967
 *                 maximum: 109.4944
 *                 nullable: true
 *                 description: "Kinh độ; phải nằm trên lãnh thổ Việt Nam — kiểm tra theo đường bờ biển thật (lib/geo/vietnamOutline.ts), không chỉ theo khung 102.0967–109.4944° E."
 *               attendance_radius:
 *                 type: integer
 *                 minimum: 10
 *                 maximum: 2000
 *                 description: Allowed check-in distance in metres. Keeps the current value when omitted.
 *     responses:
 *       200:
 *         description: The updated branch.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Branch'
 *       400:
 *         description: The route parameter or request body is invalid, including a manager_id that names no account in your organization or names an account that is not an OWNER/MANAGER (SCRUM-61).
 *       401:
 *         description: Authentication is required.
 *       403:
 *         description: The caller may not update this branch — neither the organization's OWNER nor its chi nhánh trưởng (SCRUM-61) — or tried to change who heads it.
 *       404:
 *         description: No branch exists with the supplied ID, or the caller may not update it.
 *       500:
 *         description: An unexpected server error occurred.
 *   delete:
 *     summary: Delete a branch
 *     description: |-
 *       Removes one branch (SCRUM-61). Owner only (`branch:manage`): a chi nhánh trưởng runs the branch
 *       they head, they do not delete it. The branch must be empty first — `attendance`,
 *       `shift_assignments` and `facilities` are `on delete cascade` and `daily_revenue.branch_id` has no
 *       foreign key, so deleting would destroy or orphan that history; instead of cascading, `409`
 *       reports how much is still there and those rows have to be moved or removed first.
 *       `branches_guard_delete` repeats the same check in the database.
 *     tags:
 *       - Branches
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The branch UUID.
 *     responses:
 *       200:
 *         description: The branch was deleted.
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
 *       403:
 *         description: The caller's role may not manage branches (SCRUM-59, owner only).
 *       404:
 *         description: The branch does not exist or is not deletable by the caller.
 *       409:
 *         description: The branch still holds attendance, shift, facility or revenue rows; `error` names the counts to move or remove first.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ErrorResponse'
 *                 - type: object
 *                   properties:
 *                     dependents:
 *                       type: object
 *                       description: How many rows still point at the branch (`null` when `branches_guard_delete` refused the write on its own).
 *                       properties:
 *                         attendance:
 *                           type: integer
 *                         assignments:
 *                           type: integer
 *                         facilities:
 *                           type: integer
 *                         revenue:
 *                           type: integer
 *       500:
 *         description: An unexpected server error occurred.
 */
import { NextResponse } from "next/server";

import { BranchForbiddenError } from "@/lib/domain/errors/BranchForbiddenError";
import { BranchManagerChangeForbiddenError } from "@/lib/domain/errors/BranchManagerChangeForbiddenError";
import { BranchManagerNotFoundError } from "@/lib/domain/errors/BranchManagerNotFoundError";
import { BranchManagerRoleError } from "@/lib/domain/errors/BranchManagerRoleError";
import { BranchNotEmptyError } from "@/lib/domain/errors/BranchNotEmptyError";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import { SupabaseBranchRepository } from "@/lib/infrastructure/repositories/SupabaseBranchRepository";
import { SupabaseUserRepository } from "@/lib/infrastructure/repositories/SupabaseUserRepository";
import { DeleteBranchUseCase } from "@/lib/usecases/DeleteBranchUseCase";
import { UpdateBranchUseCase } from "@/lib/usecases/UpdateBranchUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  UUID_PATTERN,
  parseBranchRequest,
} from "@/app/api/branches/_lib/branchRequest";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "The branch id must be a UUID." },
      { status: 400 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseBranchRequest(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    // SCRUM-61: the owner edits any branch, the branch head only the one they manage — the use case
    // decides which, from the session's role and id (`UpdateBranchUseCase`).
    const caller = await requireCapability("branch:update");

    if (!caller.ok) {
      return caller.response;
    }

    const updateBranch = new UpdateBranchUseCase(
      new SupabaseBranchRepository(),
      new SupabaseUserRepository(),
    );
    const branch = await updateBranch.execute(id, parsed.input, {
      userId: caller.userId,
      role: caller.role,
    });

    return NextResponse.json(branch);
  } catch (error) {
    if (
      error instanceof BranchManagerNotFoundError ||
      error instanceof BranchManagerRoleError
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof BranchNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (
      error instanceof BranchForbiddenError ||
      error instanceof BranchManagerChangeForbiddenError
    ) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("Failed to update branch", error);
    return NextResponse.json(
      { error: "Unable to update branch." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "The branch id must be a UUID." },
      { status: 400 },
    );
  }

  try {
    // A branch owns the GPS geofence every check-in is measured against, so deleting one stays an
    // owner action (SCRUM-59/61) even though a branch head may edit the branch they manage.
    const caller = await requireCapability("branch:manage");

    if (!caller.ok) {
      return caller.response;
    }

    const deleteBranch = new DeleteBranchUseCase(new SupabaseBranchRepository());
    await deleteBranch.execute(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof BranchNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof BranchNotEmptyError) {
      // The counts travel with the error so the screen can say what has to move or be removed first.
      return NextResponse.json(
        { error: error.message, dependents: error.dependents },
        { status: 409 },
      );
    }

    console.error("Failed to delete branch", error);
    return NextResponse.json(
      { error: "Unable to delete branch." },
      { status: 500 },
    );
  }
}
