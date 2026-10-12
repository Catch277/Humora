/**
 * HTTP-layer payload parsing shared by `POST /api/branches` and `PUT /api/branches/[id]`.
 *
 * It lives in a private folder (`_lib`, opted out of routing) so both route handlers keep
 * the same validation without duplicating it, and so request parsing stays in the HTTP
 * layer instead of leaking into the use cases.
 */

import { isInsideVietnam } from "@/lib/geo/vietnam";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Bounds mirrored by the `branches_attendance_radius_check` constraint in
// supabase/sql/SCRUM-47_branches.sql.
export const MIN_ATTENDANCE_RADIUS = 10;
export const MAX_ATTENDANCE_RADIUS = 2000;
export const DEFAULT_ATTENDANCE_RADIUS = 50;

export type ParsedBranchRequest = {
  name: string;
  address: string | null;
  managerId: string | null;
  latitude: number | null;
  longitude: number | null;
  attendanceRadius: number;
};

export type BranchRequestResult =
  | { ok: true; input: ParsedBranchRequest }
  | { ok: false; error: string };

function isOptionalUuid(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && UUID_PATTERN.test(value));
}

function parseCoordinate(
  value: unknown,
  maxAbs: number,
): { ok: true; value: number | null } | { ok: false } {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }

  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > maxAbs) {
    return { ok: false };
  }

  return { ok: true, value };
}

export function parseBranchRequest(payload: unknown): BranchRequestResult {
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, error: "Nội dung yêu cầu phải là một đối tượng JSON." };
  }

  const body = payload as Record<string, unknown>;
  const name = body.name;

  if (typeof name !== "string" || name.trim().length === 0 || name.trim().length > 120) {
    return {
      ok: false,
      error: "name là bắt buộc, không được rỗng và tối đa 120 ký tự.",
    };
  }

  if (
    body.address !== undefined &&
    body.address !== null &&
    (typeof body.address !== "string" || body.address.length > 300)
  ) {
    return { ok: false, error: "address tối đa 300 ký tự." };
  }

  if (!isOptionalUuid(body.manager_id)) {
    return { ok: false, error: "manager_id phải là UUID hoặc null." };
  }

  const latitude = parseCoordinate(body.latitude, 90);
  const longitude = parseCoordinate(body.longitude, 180);

  if (!latitude.ok) {
    return { ok: false, error: "latitude phải là số trong khoảng -90 đến 90 hoặc null." };
  }

  if (!longitude.ok) {
    return { ok: false, error: "longitude phải là số trong khoảng -180 đến 180 hoặc null." };
  }

  // A geofence without both coordinates is meaningless, so the pair is all-or-nothing —
  // the same rule the `branches_geofence_coordinates_check` constraint enforces.
  if ((latitude.value === null) !== (longitude.value === null)) {
    return { ok: false, error: "latitude và longitude phải gửi cùng nhau." };
  }

  // The attendance geofence is only meaningful inside the country the app operates in, and the
  // outline test lives in lib/geo/vietnam.ts so the picker refuses the same points client-side. The
  // database repeats just the bounding box (SCRUM-57), which is why this check earns its keep.
  if (latitude.value !== null && longitude.value !== null) {
    if (!isInsideVietnam(latitude.value, longitude.value)) {
      return {
        ok: false,
        error:
          "Coordinates must be inside Vietnamese territory (mainland or an island with a branch).",
      };
    }
  }

  const rawRadius = body.attendance_radius ?? DEFAULT_ATTENDANCE_RADIUS;

  if (
    typeof rawRadius !== "number" ||
    !Number.isInteger(rawRadius) ||
    rawRadius < MIN_ATTENDANCE_RADIUS ||
    rawRadius > MAX_ATTENDANCE_RADIUS
  ) {
    return {
      ok: false,
      error: `attendance_radius phải là số nguyên (mét) trong khoảng ${MIN_ATTENDANCE_RADIUS} đến ${MAX_ATTENDANCE_RADIUS}.`,
    };
  }

  return {
    ok: true,
    input: {
      name,
      address: typeof body.address === "string" ? body.address : null,
      managerId: typeof body.manager_id === "string" ? body.manager_id : null,
      latitude: latitude.value,
      longitude: longitude.value,
      attendanceRadius: rawRadius,
    },
  };
}
