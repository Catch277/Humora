/**
 * HTTP-layer payload parsing shared by `POST /api/attendance/check-in` and
 * `POST /api/attendance/check-out` (SCRUM-68).
 *
 * It lives in a private folder (`_lib`, opted out of routing) so both handlers validate the same way
 * without duplicating it, and so request parsing stays in the HTTP layer instead of leaking into the use
 * cases — the same shape `app/api/branches/_lib/branchRequest.ts` uses.
 *
 * Every field is optional-or-null: the screen sends `latitude: null` when the browser refuses a location
 * and omits what does not apply, and the API must read "not sent" and "explicitly cleared" the same way.
 */

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MAX_CHECK_IN_NOTE_LENGTH = 500;

export type ParsedCheckInRequest = {
  latitude: number | null;
  longitude: number | null;
  /** The branch a manager clocks in at; ignored for an employee. */
  branchId: string | null;
  shiftId: string | null;
  note: string | null;
};

export type ParsedCheckOutRequest = {
  /** Names the row to close when the caller has more than one ca open today. */
  attendanceId: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type CheckRequestResult<T> =
  | { ok: true; input: T }
  | { ok: false; error: string };

function readObject(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }

  return payload as Record<string, unknown>;
}

function readOptionalUuid(
  value: unknown,
): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }

  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    return { ok: false };
  }

  return { ok: true, value };
}

function readOptionalNote(
  value: unknown,
): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }

  if (typeof value !== "string" || value.trim().length > MAX_CHECK_IN_NOTE_LENGTH) {
    return { ok: false };
  }

  // A blank note is an absent note, never an empty string in the column.
  return { ok: true, value: value.trim() || null };
}

/**
 * The GPS point, which is all-or-nothing: `attendance_compute_distance` needs both numbers to derive a
 * distance, so half a pair would store a point the reviewer cannot judge.
 */
function readCoordinates(
  body: Record<string, unknown>,
): { ok: true; latitude: number | null; longitude: number | null } | { ok: false; error: string } {
  const { latitude, longitude } = body;

  const missing = latitude === undefined || latitude === null;
  const missingPair = longitude === undefined || longitude === null;

  if (missing !== missingPair) {
    return { ok: false, error: "latitude and longitude must be provided together." };
  }

  if (missing) {
    return { ok: true, latitude: null, longitude: null };
  }

  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90
  ) {
    return { ok: false, error: "latitude must be a number between -90 and 90 or null." };
  }

  if (
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180
  ) {
    return {
      ok: false,
      error: "longitude must be a number between -180 and 180 or null.",
    };
  }

  return { ok: true, latitude, longitude };
}

export function parseCheckInRequest(
  payload: unknown,
): CheckRequestResult<ParsedCheckInRequest> {
  const body = readObject(payload);

  if (!body) {
    return { ok: false, error: "The request body must be a JSON object." };
  }

  const coordinates = readCoordinates(body);

  if (!coordinates.ok) {
    return coordinates;
  }

  const branchId = readOptionalUuid(body.branch_id);
  const shiftId = readOptionalUuid(body.shift_id);
  const note = readOptionalNote(body.note);

  if (!branchId.ok) {
    return { ok: false, error: "branch_id must be a UUID or null." };
  }

  if (!shiftId.ok) {
    return { ok: false, error: "shift_id must be a UUID or null." };
  }

  if (!note.ok) {
    return {
      ok: false,
      error: `note must be a string of at most ${MAX_CHECK_IN_NOTE_LENGTH} characters or null.`,
    };
  }

  return {
    ok: true,
    input: {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      branchId: branchId.value,
      shiftId: shiftId.value,
      note: note.value,
    },
  };
}

export function parseCheckOutRequest(
  payload: unknown,
): CheckRequestResult<ParsedCheckOutRequest> {
  const body = readObject(payload);

  if (!body) {
    return { ok: false, error: "The request body must be a JSON object." };
  }

  const coordinates = readCoordinates(body);

  if (!coordinates.ok) {
    return coordinates;
  }

  const attendanceId = readOptionalUuid(body.attendance_id);

  if (!attendanceId.ok) {
    return { ok: false, error: "attendance_id must be a UUID or null." };
  }

  return {
    ok: true,
    input: {
      attendanceId: attendanceId.value,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    },
  };
}
