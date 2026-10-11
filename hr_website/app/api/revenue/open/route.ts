/**
 * @swagger
 * /api/revenue/open:
 *   post:
 *     summary: Declare opening revenue for a branch
 *     description: |-
 *       Creates one opening-revenue declaration per branch for the current business day (Asia/Bangkok).
 *       SCRUM-59: the declaration is a manager action (`revenue:manage`), so `OWNER` and `MANAGER` may
 *       declare it while an `EMPLOYEE` gets `403`.
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
 *               - open_amount
 *             properties:
 *               branch_id:
 *                 type: string
 *                 format: uuid
 *                 description: The branch UUID.
 *               open_amount:
 *                 type: number
 *                 minimum: 0
 *                 example: 1500000
 *     responses:
 *       201:
 *         description: Opening revenue was declared successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RevenueRecord'
 *       400:
 *         description: The request body is invalid.
 *       401:
 *         description: Authentication is required.
 *       403:
 *         description: The caller has no user profile, their role may not declare revenue (SCRUM-59), or they do not head that branch (SCRUM-61).
 *       404:
 *         description: The branch does not exist or is not visible to the caller.
 *       409:
 *         description: Opening revenue was already declared for this branch today.
 *       500:
 *         description: An unexpected server error occurred.
 */
import { NextResponse } from "next/server";

import { BranchForbiddenError } from "@/lib/domain/errors/BranchForbiddenError";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import { RevenueAlreadyDeclaredError } from "@/lib/domain/errors/RevenueAlreadyDeclaredError";
import { SupabaseBranchRepository } from "@/lib/infrastructure/repositories/SupabaseBranchRepository";
import { SupabaseRevenueRepository } from "@/lib/infrastructure/repositories/SupabaseRevenueRepository";
import { DeclareOpenRevenueUseCase } from "@/lib/usecases/DeclareOpenRevenueUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";

type OpenRevenueRequest = {
  branch_id?: unknown;
  open_amount?: unknown;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let body: OpenRevenueRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof body.branch_id !== "string" ||
    !UUID_PATTERN.test(body.branch_id) ||
    typeof body.open_amount !== "number" ||
    !Number.isFinite(body.open_amount) ||
    body.open_amount < 0
  ) {
    return NextResponse.json(
      {
        error:
          "branch_id must be a UUID and open_amount must be a non-negative number.",
      },
      { status: 400 },
    );
  }

  try {
    // Declaring revenue is the manager's job (SCRUM-59); SCRUM-60 narrows the rows RLS returns.
    const caller = await requireCapability("revenue:manage");

    if (!caller.ok) {
      return caller.response;
    }

    const declareOpenRevenue = new DeclareOpenRevenueUseCase(
      new SupabaseRevenueRepository(),
      new SupabaseBranchRepository(),
    );
    const record = await declareOpenRevenue.execute({
      branchId: body.branch_id,
      openAmount: body.open_amount,
      createdBy: caller.userId,
      // SCRUM-61: the branch rule needs the role; who heads the branch comes from the database.
      callerRole: caller.role,
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    if (error instanceof RevenueAlreadyDeclaredError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof BranchForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof BranchNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Failed to declare opening revenue", error);
    return NextResponse.json(
      { error: "Unable to declare opening revenue." },
      { status: 500 },
    );
  }
}
