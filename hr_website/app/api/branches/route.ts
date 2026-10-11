/**
 * @swagger
 * /api/branches:
 *   get:
 *     summary: List branches
 *     description: Returns every branch visible to the authenticated caller under the active RLS policy, oldest first — the order the branches were created in, which is the order of the numbers in their asset codes (SCRUM-67).
 *     tags:
 *       - Branches
 *     responses:
 *       200:
 *         description: The branch list.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Branch'
 *       401:
 *         description: Authentication is required.
 *       500:
 *         description: An unexpected server error occurred.
 *   post:
 *     summary: Create a branch
 *     description: Creates a branch together with its GPS geofence. Restricted to the organization's OWNER (`branch:manage`, SCRUM-59) and enforced by RLS. SCRUM-67 — the branch also receives its own asset number, which prefixes every asset code of its facilities (`01HSVH-0001`).
 *     tags:
 *       - Branches
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
 *                 example: Chi nhánh Quận 1 - Flagship Bến Thành
 *               address:
 *                 type: string
 *                 maxLength: 300
 *                 nullable: true
 *                 example: 128 Lê Lợi, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh
 *               manager_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: "Chi nhánh trưởng — `public.users.id` của một tài khoản MANAGER trong tổ chức của bạn (SCRUM-63: chủ sở hữu đứng trên mọi chi nhánh nên không phụ trách một chi nhánh cụ thể); bỏ trống hoặc null là chưa gán. `400` khi id không trỏ tới tài khoản nào mà bạn nhìn thấy được, hoặc trỏ tới một nhân viên hay chủ sở hữu."
 *               latitude:
 *                 type: number
 *                 minimum: 8.5436
 *                 maximum: 23.3883
 *                 nullable: true
 *                 example: 10.7725
 *                 description: "Vĩ độ; phải nằm trên lãnh thổ Việt Nam — kiểm tra theo đường bờ biển thật (lib/geo/vietnamOutline.ts), không chỉ theo khung 8.5436–23.3883° N."
 *               longitude:
 *                 type: number
 *                 minimum: 102.0967
 *                 maximum: 109.4944
 *                 nullable: true
 *                 example: 106.698
 *                 description: "Kinh độ; phải nằm trên lãnh thổ Việt Nam — kiểm tra theo đường bờ biển thật (lib/geo/vietnamOutline.ts), không chỉ theo khung 102.0967–109.4944° E."
 *               attendance_radius:
 *                 type: integer
 *                 minimum: 10
 *                 maximum: 2000
 *                 default: 50
 *                 description: Allowed check-in distance in metres (defaults to 50).
 *     responses:
 *       201:
 *         description: The branch was created.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Branch'
 *       400:
 *         description: The request body is invalid, including a manager_id that names no account in your organization or names an account that is not a MANAGER (SCRUM-63).
 *       401:
 *         description: Authentication is required.
 *       403:
 *         description: The caller's role may not manage branches (SCRUM-59, owner only).
 *       409:
 *         description: Another branch was created in the same instant, so the next asset number could not be claimed — saving the form again succeeds (SCRUM-67).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: An unexpected server error occurred.
 */
import { NextResponse } from "next/server";

import { BranchAssetPrefixConflictError } from "@/lib/domain/errors/BranchAssetPrefixConflictError";
import { BranchManagerNotFoundError } from "@/lib/domain/errors/BranchManagerNotFoundError";
import { BranchManagerRoleError } from "@/lib/domain/errors/BranchManagerRoleError";
import { SupabaseBranchRepository } from "@/lib/infrastructure/repositories/SupabaseBranchRepository";
import { SupabaseUserRepository } from "@/lib/infrastructure/repositories/SupabaseUserRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";
import { CreateBranchUseCase } from "@/lib/usecases/CreateBranchUseCase";
import { ListBranchesUseCase } from "@/lib/usecases/ListBranchesUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import { parseBranchRequest } from "@/app/api/branches/_lib/branchRequest";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 },
      );
    }

    const listBranches = new ListBranchesUseCase(new SupabaseBranchRepository());
    const branches = await listBranches.execute();

    return NextResponse.json(branches);
  } catch (error) {
    console.error("Failed to list branches", error);
    return NextResponse.json(
      { error: "Unable to retrieve branches." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
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
    // A branch owns the GPS geofence every check-in is measured against, so creating one is an
    // owner action (SCRUM-59); `branches` write policies repeat the rule in the database.
    const caller = await requireCapability("branch:manage");

    if (!caller.ok) {
      return caller.response;
    }

    const createBranch = new CreateBranchUseCase(
      new SupabaseBranchRepository(),
      new SupabaseUserRepository(),
    );
    const branch = await createBranch.execute(parsed.input);

    return NextResponse.json(branch, { status: 201 });
  } catch (error) {
    if (
      error instanceof BranchManagerNotFoundError ||
      error instanceof BranchManagerRoleError
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // SCRUM-67: two branches created at the same instant race for the same asset number. The repository
    // already retried once, so this is the rare second loss and the branch was not created — a `409`
    // telling the owner to save again, not a `500`.
    if (error instanceof BranchAssetPrefixConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("Failed to create branch", error);
    return NextResponse.json(
      { error: "Unable to create branch." },
      { status: 500 },
    );
  }
}
