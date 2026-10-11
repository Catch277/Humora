import { NextResponse } from "next/server";

import { ShiftRegistrationNotFoundError } from "@/lib/domain/errors/ShiftRegistrationNotFoundError";
import { ShiftSwapNotFoundError } from "@/lib/domain/errors/ShiftSwapNotFoundError";
import { ShiftWorkflowConflictError } from "@/lib/domain/errors/ShiftWorkflowConflictError";
import { ShiftWorkflowForbiddenError } from "@/lib/domain/errors/ShiftWorkflowForbiddenError";
import { ShiftWorkflowInputError } from "@/lib/domain/errors/ShiftWorkflowInputError";
import { ShiftWorkflowStateError } from "@/lib/domain/errors/ShiftWorkflowStateError";

/**
 * Shared by the shift-registration and shift-swap routes (SCRUM-23): the JSON-body reader and the
 * one place that decides which domain error answers which HTTP status.
 */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The JSON object in the body; `null` when it is missing, malformed, or not an object. */
export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();

    return body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** `null` when `value` is absent or `null`; otherwise the string, or `undefined` if it is not one. */
export function optionalString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }

  return typeof value === "string" ? value : undefined;
}

/** Maps a domain error to its HTTP answer; `null` when it is not one of ours. */
export function shiftWorkflowErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof ShiftWorkflowInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof ShiftWorkflowForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (
    error instanceof ShiftRegistrationNotFoundError ||
    error instanceof ShiftSwapNotFoundError
  ) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (
    error instanceof ShiftWorkflowStateError ||
    error instanceof ShiftWorkflowConflictError
  ) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return null;
}
