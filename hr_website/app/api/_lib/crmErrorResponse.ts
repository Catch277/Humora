import { NextResponse } from "next/server";

import { CrmConflictError } from "@/lib/domain/errors/CrmConflictError";
import { CrmForbiddenError } from "@/lib/domain/errors/CrmForbiddenError";
import { CrmInputError } from "@/lib/domain/errors/CrmInputError";
import { CrmNotFoundError } from "@/lib/domain/errors/CrmNotFoundError";

/** A body the parser refused: the sentence names the field and the caller can fix it. */
export function crmBadRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * The one place a CRM failure becomes a status code (SCRUM-101/102).
 *
 * Classification follows the meaning the repository already worked out (`crmErrors.ts` reads the constraint
 * name and the guard tokens), so this file never matches a message: `403` a role that may not write, `404` a
 * row that is not there, `409` a duplicate or a record that must not be deleted, `400` a payload only the
 * database could judge. Anything else is logged with the action and answered with the caller-safe `fallback`
 * sentence — never the driver's own text.
 */
export function crmErrorResponse(
  error: unknown,
  action: string,
  fallback: string,
): NextResponse {
  if (error instanceof CrmForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof CrmNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof CrmConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (error instanceof CrmInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error(action, error);

  return NextResponse.json({ error: fallback }, { status: 500 });
}
