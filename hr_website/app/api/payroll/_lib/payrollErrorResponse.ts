import { NextResponse } from "next/server";

import { PayrollConflictError } from "@/lib/domain/errors/PayrollConflictError";
import { PayrollForbiddenError } from "@/lib/domain/errors/PayrollForbiddenError";
import { PayrollInputError } from "@/lib/domain/errors/PayrollInputError";
import { PayrollNotFoundError } from "@/lib/domain/errors/PayrollNotFoundError";

/** A body the parser refused: the message names the field, and the caller can fix it. */
export function payrollBadRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * The one place a payroll failure becomes a status code (SCRUM-90).
 *
 * The classification follows the *meaning* the repository already worked out
 * (`lib/infrastructure/repositories/payrollErrors.ts` reads the RPC's machine token), so this file never
 * matches a message: `403` a role that may not write, `404` a row that is not there, `409` a payslip in a
 * state that forbids the action, `400` a payload only the database could judge. Anything else is logged
 * with the action and answered with the caller-safe `fallback` sentence — never the driver's own text.
 */
export function payrollErrorResponse(
  error: unknown,
  action: string,
  fallback: string,
): NextResponse {
  if (error instanceof PayrollForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof PayrollNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof PayrollConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (error instanceof PayrollInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error(action, error);

  return NextResponse.json({ error: fallback }, { status: 500 });
}
