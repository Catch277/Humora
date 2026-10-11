/**
 * Read a list out of an API response without trusting its shape.
 *
 * This app answers with both bare arrays (`/api/branches`, `/api/requests`, `/api/revenue`) and
 * envelopes (`/api/employee-status` → `{ updated_at, work_date, data }`, `/api/notifications` →
 * `{ data, total, page, page_size }`). A screen that renders a list must not die when the body is not
 * the shape it expected — that is how `/` crashed with `data.roster.filter is not a function` — so a
 * surprise body becomes an empty list and the screen shows its empty state instead.
 */
export function asArray<T>(payload: unknown): T[] {
  return Array.isArray(payload) ? (payload as T[]) : [];
}

/** `asArray` for the envelope form: `asArrayField<EmployeeStatus>(body, "data")`. */
export function asArrayField<T>(payload: unknown, field: string): T[] {
  if (typeof payload !== "object" || payload === null) {
    return [];
  }

  return asArray<T>((payload as Record<string, unknown>)[field]);
}