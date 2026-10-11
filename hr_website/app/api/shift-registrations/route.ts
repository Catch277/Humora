/**
 * @swagger
 * components:
 *   schemas:
 *     ShiftRegistration:
 *       type: object
 *       description: Đăng ký ca làm việc (SCRUM-23) — an employee asks to work a shift; approval creates the assignment.
 *       properties:
 *         id: { type: string, format: uuid }
 *         employee_id: { type: string, format: uuid }
 *         branch_id: { type: string, format: uuid }
 *         shift_id: { type: string, format: uuid }
 *         work_date: { type: string, format: date }
 *         status: { type: string, enum: [PENDING, APPROVED, REJECTED, CANCELLED] }
 *         note: { type: string, nullable: true }
 *         reviewed_by: { type: string, format: uuid, nullable: true }
 *         reviewed_at: { type: string, format: date-time, nullable: true }
 *         reject_reason: { type: string, nullable: true }
 *         created_at: { type: string, format: date-time }
 *         updated_at: { type: string, format: date-time }
 *         employee:
 *           type: object
 *           nullable: true
 *           properties:
 *             id: { type: string, format: uuid }
 *             full_name: { type: string }
 *         shift:
 *           nullable: true
 *           allOf:
 *             - $ref: '#/components/schemas/Shift'
 */

/**
 * @swagger
 * /api/shift-registrations:
 *   get:
 *     summary: List shift registrations
 *     description: |
 *       A manager sees the registrations of their organization, narrowed by the filters. An employee
 *       sees only their own, whatever the filters say.
 *     tags:
 *       - Shift registrations
 *     parameters:
 *       - { in: query, name: branch_id, schema: { type: string, format: uuid } }
 *       - { in: query, name: employee_id, schema: { type: string, format: uuid } }
 *       - { in: query, name: status, schema: { type: string, enum: [PENDING, APPROVED, REJECTED, CANCELLED] } }
 *       - { in: query, name: start_date, schema: { type: string, format: date } }
 *       - { in: query, name: end_date, schema: { type: string, format: date } }
 *     responses:
 *       200:
 *         description: The registrations, newest work date first.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ShiftRegistration'
 *       400:
 *         description: A filter is malformed.
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
 *         description: The account has no profile or its role may not view schedules.
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
 *     summary: Register for a shift
 *     description: |
 *       Đăng ký ca (SCRUM-23). The employee and the branch come from the session; the registration
 *       starts as `PENDING`. The shift must be a working template of the caller's branch (or of every
 *       branch) and the date today or later. A manager approves it later, which creates the assignment.
 *     tags:
 *       - Shift registrations
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [shift_id, work_date]
 *             properties:
 *               shift_id: { type: string, format: uuid }
 *               work_date: { type: string, format: date, example: "2026-10-13" }
 *               note: { type: string, nullable: true, maxLength: 300 }
 *     responses:
 *       201:
 *         description: The registration that was filed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ShiftRegistration'
 *       400:
 *         description: The body is invalid, the shift is unusable, or the account has no branch.
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
 *         description: The account has no profile or its role may not view schedules.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: A live registration for this shift and day already exists.
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

import { requireCapability } from "@/app/api/_lib/requireCaller";
import {
  DATE_PATTERN,
  optionalString,
  readJsonObject,
  shiftWorkflowErrorResponse,
  UUID_PATTERN,
} from "@/app/api/_lib/shiftWorkflow";
import {
  isShiftRegistrationStatus,
  type ShiftRegistrationFilters,
} from "@/lib/domain/entities/ShiftRegistration";
import { SupabaseShiftRegistrationRepository } from "@/lib/infrastructure/repositories/SupabaseShiftRegistrationRepository";
import { SupabaseShiftRepository } from "@/lib/infrastructure/repositories/SupabaseShiftRepository";
import { CreateShiftRegistrationUseCase } from "@/lib/usecases/CreateShiftRegistrationUseCase";
import { ListShiftRegistrationsUseCase } from "@/lib/usecases/ListShiftRegistrationsUseCase";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const filters: ShiftRegistrationFilters = {};

  for (const [param, key] of [
    ["branch_id", "branchId"],
    ["employee_id", "employeeId"],
  ] as const) {
    const value = params.get(param);

    if (value) {
      if (!UUID_PATTERN.test(value)) {
        return NextResponse.json(
          { error: `${param} must be a UUID.` },
          { status: 400 },
        );
      }

      filters[key] = value;
    }
  }

  for (const [param, key] of [
    ["start_date", "startDate"],
    ["end_date", "endDate"],
  ] as const) {
    const value = params.get(param);

    if (value) {
      if (!DATE_PATTERN.test(value)) {
        return NextResponse.json(
          { error: `${param} must be a date (YYYY-MM-DD).` },
          { status: 400 },
        );
      }

      filters[key] = value;
    }
  }

  const status = params.get("status");

  if (status) {
    if (!isShiftRegistrationStatus(status)) {
      return NextResponse.json(
        { error: "status is not a valid registration status." },
        { status: 400 },
      );
    }

    filters.status = status;
  }

  try {
    const caller = await requireCapability("schedule:view");

    if (!caller.ok) {
      return caller.response;
    }

    const list = new ListShiftRegistrationsUseCase(
      new SupabaseShiftRegistrationRepository(),
    );

    return NextResponse.json(
      await list.execute({
        filters,
        callerId: caller.userId,
        callerRole: caller.role,
      }),
    );
  } catch (error) {
    console.error("Failed to list shift registrations", error);
    return NextResponse.json(
      { error: "Unable to list the shift registrations." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const note = optionalString(body.note);

  if (typeof body.shift_id !== "string" || typeof body.work_date !== "string") {
    return NextResponse.json(
      { error: "shift_id and work_date are required strings." },
      { status: 400 },
    );
  }

  if (note === undefined) {
    return NextResponse.json(
      { error: "note must be a string or null." },
      { status: 400 },
    );
  }

  try {
    const caller = await requireCapability("schedule:view");

    if (!caller.ok) {
      return caller.response;
    }

    const create = new CreateShiftRegistrationUseCase(
      new SupabaseShiftRegistrationRepository(),
      new SupabaseShiftRepository(),
    );
    const registration = await create.execute({
      shiftId: body.shift_id,
      workDate: body.work_date,
      note,
      callerId: caller.userId,
      callerBranchId: caller.profile.branch_id,
    });

    return NextResponse.json(registration, { status: 201 });
  } catch (error) {
    const mapped = shiftWorkflowErrorResponse(error);

    if (mapped) {
      return mapped;
    }

    console.error("Failed to create the shift registration", error);
    return NextResponse.json(
      { error: "Unable to register for the shift." },
      { status: 500 },
    );
  }
}
