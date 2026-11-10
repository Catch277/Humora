import { PayrollConflictError } from "@/lib/domain/errors/PayrollConflictError";
import { PayrollForbiddenError } from "@/lib/domain/errors/PayrollForbiddenError";
import { PayrollInputError } from "@/lib/domain/errors/PayrollInputError";
import { PayrollNotFoundError } from "@/lib/domain/errors/PayrollNotFoundError";
import { PAYROLL_TOKENS, payrollErrorMessage } from "@/lib/domain/payrollMessages";

type PostgrestLikeError = { code?: string; message: string };

/**
 * The machine token of a payroll `raise exception` — `PAYROLL_OWNER_ONLY`,
 * `PAYSLIP_IMMUTABLE: a published payslip cannot be changed …`, `PAYSLIP_NOT_FOUND_OR_NOT_DRAFT`, …
 *
 * The token is always the first word of the message: the script writes
 * `raise exception 'TOKEN: explanation'` so PostgREST hands the whole sentence back, and matching the
 * prefix is what lets one entry in `lib/domain/payrollMessages.ts` cover several `raise` sites.
 */
const TOKEN_PATTERN = /^[A-Z][A-Z0-9_]{3,}/;

export function payrollErrorToken(message: string | null | undefined): string | null {
  const match = message ? TOKEN_PATTERN.exec(message.trim()) : null;

  return match ? match[0] : null;
}

/** `403`: the caller's role holds no payroll write (raised by `payroll_require_owner`). */
const FORBIDDEN_TOKENS: ReadonlySet<string> = new Set([
  PAYROLL_TOKENS.authRequired,
  PAYROLL_TOKENS.ownerOnly,
  PAYROLL_TOKENS.noOrganization,
  PAYROLL_TOKENS.auditAppendOnly,
]);

/** `404`: the row is not there, or RLS hides it (an id from another organization). */
const NOT_FOUND_TOKENS: ReadonlySet<string> = new Set([
  PAYROLL_TOKENS.employeeNotFound,
  PAYROLL_TOKENS.payProfileNotFound,
  PAYROLL_TOKENS.payslipNotFound,
  PAYROLL_TOKENS.payslipNotFoundOrNotDraft,
  PAYROLL_TOKENS.itemNotFound,
]);

/** `409`: a *business* state conflict — published, void, already disputed, still disputed. */
const CONFLICT_TOKENS: ReadonlySet<string> = new Set([
  PAYROLL_TOKENS.immutable,
  PAYROLL_TOKENS.badStatus,
  PAYROLL_TOKENS.noOpenDispute,
  PAYROLL_TOKENS.alreadyDisputed,
  PAYROLL_TOKENS.payProfileDuplicate,
]);

/** `400`: the payload breaks a rule only the database can judge (today in Bangkok, the running sums). */
const INPUT_TOKENS: ReadonlySet<string> = new Set([
  PAYROLL_TOKENS.futurePeriod,
  PAYROLL_TOKENS.periodNotFinished,
  PAYROLL_TOKENS.voidReasonRequired,
  PAYROLL_TOKENS.disputeNoteLength,
  PAYROLL_TOKENS.deductionsExceedGross,
]);

/**
 * Turns what PostgREST answered into the module's own errors.
 *
 * Classification is by **token**, not by Postgres code: `P0002` covers "no such payslip" and "that payslip
 * already has an open khiếu nại", which are a `404` and a `409` respectively, so the code alone would make
 * one of the two lie. `action` is the English verb phrase for the log line (`Unable to publish the payslips:`),
 * which — like every repository diagnostic — stays English and never reaches a caller.
 */
export function throwPayrollError(
  error: PostgrestLikeError,
  action: string,
): never {
  const token = payrollErrorToken(error.message);

  if (token && FORBIDDEN_TOKENS.has(token)) {
    throw new PayrollForbiddenError(payrollErrorMessage(token));
  }

  if (token && NOT_FOUND_TOKENS.has(token)) {
    throw new PayrollNotFoundError(payrollErrorMessage(token));
  }

  if (token && CONFLICT_TOKENS.has(token)) {
    throw new PayrollConflictError(payrollErrorMessage(token));
  }

  if (token && INPUT_TOKENS.has(token)) {
    throw new PayrollInputError(payrollErrorMessage(token));
  }

  throw new Error(`Unable to ${action}: ${error.message}`);
}
