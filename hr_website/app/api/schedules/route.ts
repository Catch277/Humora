/**
 * @swagger
 * /api/schedules:
 *   get:
 *     summary: List shift assignments
 *     description: |
 *       The week/day view of the schedule (SCRUM-30). Each row is one employee assigned to one
 *       shift template on one business date, with the employee name and the shift hours
 *       embedded so the screen needs a single request.
 *     tags:
 *       - Schedules
 *     parameters:
 *       - in: query
 *         name: branch_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: employee_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Inclusive lower bound on `work_date`.
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Inclusive upper bound on `work_date`.
 *     responses:
 *       200:
 *         description: The shift assignments, ordered by date.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ShiftAssignment'
 *       400:
 *         description: A filter is not a UUID or not a calendar date.
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
 *       500:
 *         description: An unexpected server error occurred.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   post:
 *     summary: Schedule a shift
 *     description: |
 *       Assigns one employee to one shift template on one business date. Answers `409` when the
 *       same employee already has an overlapping shift that day (or the exact same template).
 *       Restricted to managers (`schedule:manage`, SCRUM-59) and enforced by RLS.
 *     tags:
 *       - Schedules
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ShiftAssignmentWriteRequest'
 *     responses:
 *       201:
 *         description: The created shift assignment.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ShiftAssignment'
 *       400:
 *         description: The request body is invalid.
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
 *         description: The caller's role may not write the schedule (SCRUM-59), or they do not head the branch the shift belongs to (SCRUM-61).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: The referenced shift template does not exist, or the branch is not visible to the caller.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: The employee already has an overlapping shift on that date.
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
import { NextResponse, type NextRequest } from "next/server";

import { BranchForbiddenError } from "@/lib/domain/errors/BranchForbiddenError";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import { ShiftNotFoundError } from "@/lib/domain/errors/ShiftNotFoundError";
import { ShiftOverlapError } from "@/lib/domain/errors/ShiftOverlapError";
import { SupabaseBranchRepository } from "@/lib/infrastructure/repositories/SupabaseBranchRepository";
import { SupabaseShiftAssignmentRepository } from "@/lib/infrastructure/repositories/SupabaseShiftAssignmentRepository";
import { SupabaseShiftRepository } from "@/lib/infrastructure/repositories/SupabaseShiftRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";
import { CreateShiftAssignmentUseCase } from "@/lib/usecases/CreateShiftAssignmentUseCase";
import { ListShiftAssignmentsUseCase } from "@/lib/usecases/ListShiftAssignmentsUseCase";
import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  UUID_PATTERN,
  isCalendarDate,
  parseScheduleRequest,
} from "@/app/api/schedules/_lib/scheduleRequest";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const branchId = params.get("branch_id") ?? undefined;
  const employeeId = params.get("employee_id") ?? undefined;
  const startDate = params.get("start_date") ?? undefined;
  const endDate = params.get("end_date") ?? undefined;

  if (branchId && !UUID_PATTERN.test(branchId)) {
    return NextResponse.json(
      { error: "branch_id must be a UUID." },
      { status: 400 },
    );
  }

  if (employeeId && !UUID_PATTERN.test(employeeId)) {
    return NextResponse.json(
      { error: "employee_id must be a UUID." },
      { status: 400 },
    );
  }

  if (startDate && !isCalendarDate(startDate)) {
    return NextResponse.json(
      { error: "start_date must be a calendar date (YYYY-MM-DD)." },
      { status: 400 },
    );
  }

  if (endDate && !isCalendarDate(endDate)) {
    return NextResponse.json(
      { error: "end_date must be a calendar date (YYYY-MM-DD)." },
      { status: 400 },
    );
  }

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

    const listAssignments = new ListShiftAssignmentsUseCase(
      new SupabaseShiftAssignmentRepository(),
    );
    const assignments = await listAssignments.execute({
      branchId,
      employeeId,
      startDate,
      endDate,
    });

    return NextResponse.json(assignments);
  } catch (error) {
    console.error("Failed to list shift assignments", error);
    return NextResponse.json(
      { error: "Unable to retrieve the schedule." },
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

  const parsed = parseScheduleRequest(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    // Writing the schedule is a manager action (SCRUM-59); `shift_assignments` write policies repeat
    // it in the database, and SCRUM-60 narrows the *read* to the employee's own shifts.
    const caller = await requireCapability("schedule:manage");

    if (!caller.ok) {
      return caller.response;
    }

    const createAssignment = new CreateShiftAssignmentUseCase(
      new SupabaseShiftAssignmentRepository(),
      new SupabaseShiftRepository(),
      new SupabaseBranchRepository(),
    );
    const assignment = await createAssignment.execute({
      ...parsed.input,
      // SCRUM-61: the branch being scheduled into decides whether this manager may write it.
      callerId: caller.userId,
      callerRole: caller.role,
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    if (error instanceof ShiftNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof ShiftOverlapError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof BranchForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof BranchNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Failed to create shift assignment", error);
    return NextResponse.json(
      { error: "Unable to create the shift assignment." },
      { status: 500 },
    );
  }
}
