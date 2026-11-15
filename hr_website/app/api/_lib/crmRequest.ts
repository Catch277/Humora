export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Round-trips a calendar date so `2026-02-31` is refused instead of rolling into March. */
export function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** Reads a JSON object body, answering the `400` the route recipe asks for instead of throwing. */
export async function readJsonBody(
  request: Request,
): Promise<ParseResult<Record<string, unknown>>> {
  try {
    const body: unknown = await request.json();

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return { ok: false, error: "Nội dung yêu cầu phải là JSON object." };
    }

    return { ok: true, value: body as Record<string, unknown> };
  } catch {
    return { ok: false, error: "Nội dung JSON không hợp lệ." };
  }
}

export function readRequiredString(
  body: Record<string, unknown>,
  field: string,
): ParseResult<string> {
  const value = body[field];

  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, error: `${field} là bắt buộc và phải là chuỗi khác rỗng.` };
  }

  return { ok: true, value: value.trim() };
}

/** An absent or `null` optional field reads as `null`; a non-string is refused. */
export function readOptionalString(
  body: Record<string, unknown>,
  field: string,
): ParseResult<string | null> {
  const value = body[field];

  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }

  if (typeof value !== "string") {
    return { ok: false, error: `${field} phải là chuỗi hoặc null.` };
  }

  return { ok: true, value: value.trim() === "" ? null : value.trim() };
}

export function readUuid(
  body: Record<string, unknown>,
  field: string,
): ParseResult<string> {
  const value = body[field];

  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    return { ok: false, error: `${field} phải là UUID.` };
  }

  return { ok: true, value };
}

export function readOptionalUuid(
  body: Record<string, unknown>,
  field: string,
): ParseResult<string | null> {
  const value = body[field];

  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }

  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    return { ok: false, error: `${field} phải là UUID hoặc null.` };
  }

  return { ok: true, value };
}

export function readInteger(
  body: Record<string, unknown>,
  field: string,
  fallback?: number,
): ParseResult<number> {
  const value = body[field];

  if ((value === undefined || value === null) && fallback !== undefined) {
    return { ok: true, value: fallback };
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    return { ok: false, error: `${field} phải là số nguyên.` };
  }

  return { ok: true, value };
}

export function readNumber(
  body: Record<string, unknown>,
  field: string,
  fallback?: number,
): ParseResult<number> {
  const value = body[field];

  if ((value === undefined || value === null) && fallback !== undefined) {
    return { ok: true, value: fallback };
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, error: `${field} phải là số.` };
  }

  return { ok: true, value };
}

export function readBoolean(
  body: Record<string, unknown>,
  field: string,
  fallback: boolean,
): ParseResult<boolean> {
  const value = body[field];

  if (value === undefined || value === null) {
    return { ok: true, value: fallback };
  }

  if (typeof value !== "boolean") {
    return { ok: false, error: `${field} phải là true hoặc false.` };
  }

  return { ok: true, value };
}

/** One of `allowed`, with a default for an absent field. */
export function readEnum<T extends string>(
  body: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
  fallback?: T,
): ParseResult<T> {
  const value = body[field];

  if ((value === undefined || value === null) && fallback !== undefined) {
    return { ok: true, value: fallback };
  }

  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    return {
      ok: false,
      error: `${field} phải là một trong: ${allowed.join(", ")}.`,
    };
  }

  return { ok: true, value: value as T };
}
