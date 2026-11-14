import type { MessageKey, Translate } from "@/lib/i18n/translate";
import { translateVi } from "@/lib/i18n/translate";

/**
 * The machine codes the payroll RPCs raise, and the sentence each one becomes (SCRUM-90).
 *
 * The RPCs in `supabase/sql/SCRUM-90_payroll.sql` never return English prose: every `raise exception`
 * carries a stable token as its message (`PAYROLL_OWNER_ONLY`, `PAYSLIP_IMMUTABLE: …`,
 * `PAYSLIP_NOT_FOUND_OR_NOT_DRAFT`, …) plus the Postgres state that classifies it (`42501`, `22023`,
 * `P0002`, `23514`, `22007`, `28000`). This file is the one place the app turns a token into copy, for the
 * same reason `passkeyMessages.ts` exists: the wording belongs to the dictionary, the mapping belongs to
 * the domain, and `lib/domain` therefore keeps importing neither Supabase nor Next.js.
 *
 * Only the token is matched — the English tail of `PAYSLIP_IMMUTABLE: …` is deliberately ignored, because
 * several different situations share that prefix and the reader should not see which `raise` fired.
 */
const PAYROLL_MESSAGE_KEYS: Readonly<Record<string, MessageKey>> = {
  AUTH_REQUIRED: "payrollError.authRequired",
  PAYROLL_OWNER_ONLY: "payrollError.ownerOnly",
  PAYROLL_NO_ORGANIZATION: "payrollError.noOrganization",
  PAYROLL_AUDIT_APPEND_ONLY: "payrollError.auditAppendOnly",

  PAYROLL_EMPLOYEE_NOT_FOUND: "payrollError.employeeNotFound",
  PAY_PROFILE_NOT_FOUND: "payrollError.payProfileNotFound",
  PAYSLIP_NOT_FOUND: "payrollError.payslipNotFound",
  PAYSLIP_NOT_FOUND_OR_NOT_DRAFT: "payrollError.payslipNotFoundOrNotDraft",
  PAYSLIP_ITEM_NOT_FOUND: "payrollError.itemNotFound",

  PAYSLIP_IMMUTABLE: "payrollError.immutable",
  PAYSLIP_BAD_STATUS: "payrollError.badStatus",
  PAYSLIP_NO_OPEN_DISPUTE: "payrollError.noOpenDispute",
  PAYSLIP_NOT_FOUND_OR_DISPUTE_OPEN: "payrollError.alreadyDisputed",
  PAY_PROFILE_DUPLICATE: "payrollError.payProfileDuplicate",

  PAYROLL_FUTURE_PERIOD: "payrollError.futurePeriod",
  PAYROLL_PERIOD_NOT_FINISHED: "payrollError.periodNotFinished",
  PAYSLIP_VOID_REASON_REQUIRED: "payrollError.voidReasonRequired",
  PAYSLIP_DISPUTE_NOTE_LENGTH: "payrollError.disputeNoteLength",
  PAYSLIP_DEDUCTIONS_EXCEED_GROSS: "payrollError.deductionsExceedGross",
  PAYSLIP_TARGET_INVALID: "payrollError.targetInvalid",
};

/**
 * The sentence of one token.
 *
 * `t` is optional and last: the repository uses the source locale so a `500`-free answer is always
 * Vietnamese, and a screen that wants the reader's language can pass `useLocale().t`. A token this file
 * does not know (a database one script ahead) answers the generic sentence instead of a machine code.
 */
export function payrollErrorMessage(
  token: string | null | undefined,
  t: Translate = translateVi,
): string {
  const key = token ? PAYROLL_MESSAGE_KEYS[token] : undefined;

  return t(key ?? "payrollError.fallback");
}

/**
 * The machine codes, exported so the route layer can classify a token without repeating the list
 * (`app/api/payroll/_lib/payrollErrorResponse.ts` decides `403`/`404`/`409`/`400` from it).
 */
export const PAYROLL_TOKENS = {
  authRequired: "AUTH_REQUIRED",
  ownerOnly: "PAYROLL_OWNER_ONLY",
  noOrganization: "PAYROLL_NO_ORGANIZATION",
  auditAppendOnly: "PAYROLL_AUDIT_APPEND_ONLY",
  employeeNotFound: "PAYROLL_EMPLOYEE_NOT_FOUND",
  payProfileNotFound: "PAY_PROFILE_NOT_FOUND",
  payslipNotFound: "PAYSLIP_NOT_FOUND",
  payslipNotFoundOrNotDraft: "PAYSLIP_NOT_FOUND_OR_NOT_DRAFT",
  itemNotFound: "PAYSLIP_ITEM_NOT_FOUND",
  immutable: "PAYSLIP_IMMUTABLE",
  badStatus: "PAYSLIP_BAD_STATUS",
  noOpenDispute: "PAYSLIP_NO_OPEN_DISPUTE",
  alreadyDisputed: "PAYSLIP_NOT_FOUND_OR_DISPUTE_OPEN",
  payProfileDuplicate: "PAY_PROFILE_DUPLICATE",
  futurePeriod: "PAYROLL_FUTURE_PERIOD",
  periodNotFinished: "PAYROLL_PERIOD_NOT_FINISHED",
  voidReasonRequired: "PAYSLIP_VOID_REASON_REQUIRED",
  disputeNoteLength: "PAYSLIP_DISPUTE_NOTE_LENGTH",
  deductionsExceedGross: "PAYSLIP_DEDUCTIONS_EXCEED_GROSS",
  targetInvalid: "PAYSLIP_TARGET_INVALID",
} as const;
