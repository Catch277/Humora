import {
  PAYSLIP_ITEM_AMOUNT_MAX,
  PAYSLIP_ITEM_CODE_PATTERN,
  PAYSLIP_ITEM_LABEL_LENGTH,
  isPayslipItemKind,
  type AddPayslipItemInput,
} from "@/lib/domain/entities/PayslipItem";
import {
  PAYSLIP_DISPUTE_NOTE_LENGTH,
  PAYSLIP_VOID_REASON_LENGTH,
} from "@/lib/domain/entities/Payslip";
import {
  PAY_PROFILE_LIMITS,
  type SetPayProfileInput,
} from "@/lib/domain/entities/PayProfile";

/**
 * The bodies and query values the payroll routes accept (SCRUM-90), parsed once for the handlers that
 * share them: the rate upsert and the five payslip actions read the same shapes.
 *
 * Every CHECK constraint of `supabase/sql/SCRUM-90_payroll.sql` is mirrored here, in the *route* layer, so
 * a value the database would refuse answers `400` with the field named instead of reaching the RPC and
 * coming back as a `500`. The one thing a parser cannot know is "today in Asia/Bangkok" and the running
 * totals — those stay with the functions (`PAYROLL_FUTURE_PERIOD`, `PAYSLIP_DEDUCTIONS_EXCEED_GROSS`).
 */
export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_PATTERN = /^(\d{4})-(\d{2})$/;

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

/**
 * `YYYY-MM` (the value an `<input type="month">` sends) as the first day of that month, which is what
 * `generate_payslips` / `publish_payslips` / `my_pay_estimate` take and what `payslips.period_start`
 * stores. A month is a *business* month in Asia/Bangkok; the string needs no timezone to become a date.
 */
export function parsePayrollPeriod(value: string | null): ParseResult<string> {
  const match = value ? PERIOD_PATTERN.exec(value) : null;
  const month = match ? Number(match[2]) : 0;
  const year = match ? Number(match[1]) : 0;

  if (!match || month < 1 || month > 12 || year < 2000 || year > 2100) {
    return { ok: false, error: "month phải có dạng YYYY-MM." };
  }

  return { ok: true, value: `${match[1]}-${match[2]}-01` };
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

/** An integer inside `[min, max]`; `undefined`/`null` (and anything invalid) answer `null`. */
function readInteger(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  return value >= min && value <= max ? value : null;
}

/** The `body` of `PUT /api/payroll/profiles` — one rate for one employee, effective from one day. */
export function parsePayProfileBody(
  body: Record<string, unknown>,
): ParseResult<SetPayProfileInput> {
  const employeeId = body.employeeId;
  const effectiveFrom = body.effectiveFrom;
  const rawMultiplier = body.overtimeMultiplier;
  const rawAllowance = body.fixedAllowance;
  const note = body.note;

  if (typeof employeeId !== "string" || !UUID_PATTERN.test(employeeId)) {
    return { ok: false, error: "employeeId phải là UUID." };
  }

  const hourlyRate = readInteger(
    body.hourlyRate,
    PAY_PROFILE_LIMITS.hourlyRate.min,
    PAY_PROFILE_LIMITS.hourlyRate.max,
  );

  if (hourlyRate === null) {
    return {
      ok: false,
      error: `hourlyRate phải là số nguyên từ ${PAY_PROFILE_LIMITS.hourlyRate.min} đến ${PAY_PROFILE_LIMITS.hourlyRate.max}.`,
    };
  }

  if (typeof effectiveFrom !== "string" || !isCalendarDate(effectiveFrom)) {
    return { ok: false, error: "effectiveFrom phải là ngày dạng YYYY-MM-DD." };
  }

  // `numeric(3,2)` in the column: two decimals, inside 1..5. Absent means the SQL default of 1.5.
  let overtimeMultiplier = 1.5;

  if (rawMultiplier !== undefined && rawMultiplier !== null) {
    const scaled = typeof rawMultiplier === "number" ? rawMultiplier * 100 : NaN;

    if (
      !Number.isFinite(scaled) ||
      Math.abs(scaled - Math.round(scaled)) > 1e-9 ||
      scaled < PAY_PROFILE_LIMITS.overtimeMultiplier.min * 100 ||
      scaled > PAY_PROFILE_LIMITS.overtimeMultiplier.max * 100
    ) {
      return {
        ok: false,
        error: `overtimeMultiplier phải từ ${PAY_PROFILE_LIMITS.overtimeMultiplier.min} đến ${PAY_PROFILE_LIMITS.overtimeMultiplier.max}, tối đa 2 chữ số thập phân.`,
      };
    }

    overtimeMultiplier = rawMultiplier as number;
  }

  let fixedAllowance = 0;

  if (rawAllowance !== undefined && rawAllowance !== null) {
    const parsed = readInteger(
      rawAllowance,
      PAY_PROFILE_LIMITS.fixedAllowance.min,
      PAY_PROFILE_LIMITS.fixedAllowance.max,
    );

    if (parsed === null) {
      return {
        ok: false,
        error: `fixedAllowance phải là số nguyên từ ${PAY_PROFILE_LIMITS.fixedAllowance.min} đến ${PAY_PROFILE_LIMITS.fixedAllowance.max}.`,
      };
    }

    fixedAllowance = parsed;
  }

  if (!isOptionalString(note)) {
    return { ok: false, error: "note phải là chuỗi." };
  }

  if (note && note.length > PAY_PROFILE_LIMITS.noteLength) {
    return {
      ok: false,
      error: `note tối đa ${PAY_PROFILE_LIMITS.noteLength} ký tự.`,
    };
  }

  return {
    ok: true,
    value: {
      employeeId,
      hourlyRate,
      effectiveFrom,
      overtimeMultiplier,
      fixedAllowance,
      note: note ?? null,
    },
  };
}

/** The `body` of `POST /api/payroll/payslips/[id]/items`. */
export function parsePayslipItemBody(
  body: Record<string, unknown>,
): ParseResult<AddPayslipItemInput> {
  const kind = body.kind;
  const amount = readInteger(body.amount, 1, PAYSLIP_ITEM_AMOUNT_MAX);

  if (!isPayslipItemKind(kind)) {
    return { ok: false, error: "kind phải là EARNING hoặc DEDUCTION." };
  }

  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";

  if (!PAYSLIP_ITEM_CODE_PATTERN.test(code)) {
    return {
      ok: false,
      error: "code phải gồm 2-30 ký tự A-Z, 0-9 hoặc dấu gạch dưới.",
    };
  }

  const label = typeof body.label === "string" ? body.label.trim() : "";

  if (
    label.length < PAYSLIP_ITEM_LABEL_LENGTH.min ||
    label.length > PAYSLIP_ITEM_LABEL_LENGTH.max
  ) {
    return {
      ok: false,
      error: `label phải từ ${PAYSLIP_ITEM_LABEL_LENGTH.min} đến ${PAYSLIP_ITEM_LABEL_LENGTH.max} ký tự.`,
    };
  }

  if (amount === null) {
    return {
      ok: false,
      error: `amount phải là số nguyên từ 1 đến ${PAYSLIP_ITEM_AMOUNT_MAX}.`,
    };
  }

  return { ok: true, value: { kind, code, label, amount } };
}

/** The `body` of `POST /api/payroll/payslips/[id]/void`. */
export function parseVoidBody(body: Record<string, unknown>): ParseResult<string> {
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (
    reason.length < PAYSLIP_VOID_REASON_LENGTH.min ||
    reason.length > PAYSLIP_VOID_REASON_LENGTH.max
  ) {
    return {
      ok: false,
      error: `reason phải từ ${PAYSLIP_VOID_REASON_LENGTH.min} đến ${PAYSLIP_VOID_REASON_LENGTH.max} ký tự.`,
    };
  }

  return { ok: true, value: reason };
}

/** The `body` of `POST /api/payroll/payslips/[id]/dispute` (the employee's khiếu nại). */
export function parseDisputeBody(
  body: Record<string, unknown>,
): ParseResult<string> {
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (
    note.length < PAYSLIP_DISPUTE_NOTE_LENGTH.min ||
    note.length > PAYSLIP_DISPUTE_NOTE_LENGTH.max
  ) {
    return {
      ok: false,
      error: `note phải từ ${PAYSLIP_DISPUTE_NOTE_LENGTH.min} đến ${PAYSLIP_DISPUTE_NOTE_LENGTH.max} ký tự.`,
    };
  }

  return { ok: true, value: note };
}

/** Reads a JSON body, answering the `400` the recipe asks for instead of throwing. */
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
