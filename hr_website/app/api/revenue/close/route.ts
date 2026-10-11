/**
 * @swagger
 * /api/revenue/close:
 *   put:
 *     summary: Declare closing revenue for a branch
 *     description: |-
 *       Closes the current business day's opening-revenue record for a branch (Asia/Bangkok).
 *       SCRUM-59: closing is a manager action (`revenue:manage`), so `OWNER` and `MANAGER` may close a
 *       day while an `EMPLOYEE` gets `403`.
 *     tags:
 *       - Revenue
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - branch_id
 *               - close_amount
 *             properties:
 *               branch_id:
 *                 type: string
 *                 format: uuid
 *                 description: The branch UUID.
 *               close_amount:
 *                 type: number
 *                 minimum: 0
 *                 example: 2200000
 *               close_note:
 *                 type: string
 *                 nullable: true
 *                 example: Cash counted and reconciled at shift end.
 *               close_image_url:
 *                 type: string
 *                 format: uri
 *                 nullable: true
 *                 example: https://example.supabase.co/storage/v1/object/public/revenue/close.jpg
 *     responses:
 *       200:
 *         description: Closing revenue was declared successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - revenue
 *                 - revenue_difference
 *               properties:
 *                 revenue:
 *                   $ref: '#/components/schemas/RevenueRecord'
 *                 revenue_difference:
 *                   type: number
 *                   description: close_amount minus open_amount; UI can use this for warnings.
 *       400:
 *         description: The request body is invalid.
 *       401:
 *         description: Authentication is required.
 *       403:
 *         description: The caller has no user profile, their role may not declare revenue (SCRUM-59), or they do not head that branch (SCRUM-61).
 *       404:
 *         description: No opening-revenue declaration exists for this branch today.
 *       500:
 *         description: An unexpected server error occurred.
 */
import { NextResponse } from "next/server";

import { BranchForbiddenError } from "@/lib/domain/errors/BranchForbiddenError";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import { OpenRevenueNotFoundError } from "@/lib/domain/errors/OpenRevenueNotFoundError";
import { SupabaseBranchRepository } from "@/lib/infrastructure/repositories/SupabaseBranchRepository";
import { SupabaseRevenueRepository } from "@/lib/infrastructure/repositories/SupabaseRevenueRepository";
import { DeclareCloseRevenueUseCase } from "@/lib/usecases/DeclareCloseRevenueUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";

type CloseRevenueRequest = {
  branch_id?: unknown;
  close_amount?: unknown;
  close_note?: unknown;
  close_image_url?: unknown;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * `close_note` and `close_image_url` are optional **and nullable** — the documented body marks both
 * `nullable: true`, the columns are `text`, and the screen sends `null` whenever the note box is left
 * empty (`closeNote.trim() || null`). Treating `null` as invalid is what made every close without a
 * note answer `400`, so this test accepts `null` exactly like an omitted key and only rejects another
 * type. The explicit `value is …` predicate also keeps the narrowed type below `string | null | undefined`.
 */
function isOptionalNullableString(
  value: unknown,
): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

export async function PUT(request: Request) {
  let body: CloseRevenueRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof body.branch_id !== "string" ||
    !UUID_PATTERN.test(body.branch_id) ||
    typeof body.close_amount !== "number" ||
    !Number.isFinite(body.close_amount) ||
    body.close_amount < 0 ||
    !isOptionalNullableString(body.close_note) ||
    !isOptionalNullableString(body.close_image_url)
  ) {
    return NextResponse.json(
      {
        error:
          "branch_id must be a UUID, close_amount must be a non-negative number, and optional close_note/close_image_url must be strings.",
      },
      { status: 400 },
    );
  }

  try {
    // Closing revenue is the manager's job (SCRUM-59); SCRUM-60 narrows the rows RLS returns.
    const caller = await requireCapability("revenue:manage");

    if (!caller.ok) {
      return caller.response;
    }

    const declareCloseRevenue = new DeclareCloseRevenueUseCase(
      new SupabaseRevenueRepository(),
      new SupabaseBranchRepository(),
    );
    const result = await declareCloseRevenue.execute({
      branchId: body.branch_id,
      closeAmount: body.close_amount,
      closeNote: body.close_note ?? null,
      closeImageUrl: body.close_image_url ?? null,
      closedBy: caller.userId,
      // SCRUM-61: the branch rule needs the role; who heads the branch comes from the database.
      callerRole: caller.role,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof OpenRevenueNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof BranchForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof BranchNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Failed to declare closing revenue", error);
    return NextResponse.json(
      { error: "Unable to declare closing revenue." },
      { status: 500 },
    );
  }
}
