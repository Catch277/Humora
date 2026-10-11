import { NextResponse } from "next/server";

import { AttendanceAlreadyCheckedInError } from "@/lib/domain/errors/AttendanceAlreadyCheckedInError";
import { AttendanceAlreadyCheckedOutError } from "@/lib/domain/errors/AttendanceAlreadyCheckedOutError";
import { AttendanceAmbiguousShiftError } from "@/lib/domain/errors/AttendanceAmbiguousShiftError";
import { AttendanceClockInputError } from "@/lib/domain/errors/AttendanceClockInputError";
import { AttendanceNoAssignmentError } from "@/lib/domain/errors/AttendanceNoAssignmentError";
import { AttendanceNotCheckedInError } from "@/lib/domain/errors/AttendanceNotCheckedInError";
import { AttendanceNotFoundError } from "@/lib/domain/errors/AttendanceNotFoundError";
import type { ClockPointInput } from "@/lib/domain/entities/AttendanceClock";

/**
 * Shared by `check-in` and `check-out` (SCRUM-22, SCRUM-29): the two bodies carry the same
 * position/photo/note, and the two use cases fail with the same family of errors.
 */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ClockBody = {
  latitude?: unknown;
  longitude?: unknown;
  photo_url?: unknown;
  note?: unknown;
  assignment_id?: unknown;
};

export type ParsedClockBody =
  | { ok: true; point: ClockPointInput; assignmentId: string | null }
  | { ok: false; message: string };

/** Reads the JSON body; `null` when it is not a JSON object. */
export async function readClockBody(request: Request): Promise<ClockBody | null> {
  try {
    const body: unknown = await request.json();

    return body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as ClockBody)
      : null;
  } catch {
    return null;
  }
}

/**
 * Checks the types only — a number is a number, text is text. The ranges and lengths are the
 * use case's job (`normalizeClockPoint`), so there is one copy of those rules.
 */
export function parseClockBody(body: ClockBody): ParsedClockBody {
  if (typeof body.latitude !== "number" || typeof body.longitude !== "number") {
    return {
      ok: false,
      message: "latitude and longitude are required and must be numbers.",
    };
  }

  if (
    body.photo_url !== undefined &&
    body.photo_url !== null &&
    typeof body.photo_url !== "string"
  ) {
    return { ok: false, message: "photo_url must be a string or null." };
  }

  if (
    body.note !== undefined &&
    body.note !== null &&
    typeof body.note !== "string"
  ) {
    return { ok: false, message: "note must be a string or null." };
  }

  let assignmentId: string | null = null;

  if (body.assignment_id !== undefined && body.assignment_id !== null) {
    if (
      typeof body.assignment_id !== "string" ||
      !UUID_PATTERN.test(body.assignment_id)
    ) {
      return { ok: false, message: "assignment_id must be a UUID." };
    }

    assignmentId = body.assignment_id;
  }

  return {
    ok: true,
    assignmentId,
    point: {
      latitude: body.latitude,
      longitude: body.longitude,
      photoUrl: typeof body.photo_url === "string" ? body.photo_url : null,
      note: typeof body.note === "string" ? body.note : null,
    },
  };
}

/** Maps a domain error to its HTTP answer; `null` when it is not one of ours. */
export function clockErrorResponse(error: unknown): NextResponse | null {
  if (
    error instanceof AttendanceClockInputError ||
    error instanceof AttendanceAmbiguousShiftError
  ) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (
    error instanceof AttendanceNoAssignmentError ||
    error instanceof AttendanceNotFoundError
  ) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (
    error instanceof AttendanceAlreadyCheckedInError ||
    error instanceof AttendanceNotCheckedInError ||
    error instanceof AttendanceAlreadyCheckedOutError
  ) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return null;
}
