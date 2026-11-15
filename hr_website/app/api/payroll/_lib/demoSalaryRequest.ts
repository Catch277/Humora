import {
  DEMO_PAY_LIMITS,
  isDemoPaySalaryStatus,
  type CreateDemoPaySalaryInput,
  type UpdateDemoPaySalaryInput,
} from "@/lib/domain/entities/DemoPaySalary";
import {
  UUID_PATTERN,
  isCalendarDate,
  type ParseResult,
} from "@/app/api/payroll/_lib/payrollRequest";

/**
 * The bodies the trial-salary routes accept (SCRUM-100), parsed once for the two handlers that share them.
 *
 * Every CHECK of `supabase/sql/SCRUM-100_demo_pay_salaries.sql` is mirrored here — the bounds, the integrality
 * of the four money columns and the two decimals of `monthly_hours` — so a value the database would refuse
 * answers `400` naming the field instead of reaching the RPC and coming back as a `500`.
 *
 * Two rules deliberately stay out of this file, because a parser must not own a business decision: whether the
 * position is one the app knows (`CreateDemoPaySalaryUseCase`) and whether `deduction ≤ gross`
 * (`DEMO_PAY_DEDUCTIONS_EXCEED_GROSS`, which needs the totals the database computes).
 */

/** A money column: integer VND inside `[0, max]`. `undefined`/`null` answer the fallback (0 for most columns). */
function readMoney(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  return value >= 0 && value <= max ? value : null;
}

/**
 * `numeric(6,2)` hours. Two decimals at most: Postgres would round a third silently, and a stored row that
 * differs from what the form showed is exactly the kind of surprise this screen must not produce.
 */
function readHours(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (value <= 0 || value > DEMO_PAY_LIMITS.monthlyHours.max) {
    return null;
  }

  const scaled = value * 100;

  return Math.abs(scaled - Math.round(scaled)) > 1e-9 ? null : scaled / 100;
}

/** `body` of `POST /api/payroll/demo-salaries` — one trial salary for one position. */
export function parseDemoSalaryBody(
  body: Record<string, unknown>,
): ParseResult<CreateDemoPaySalaryInput> {
  const positionCode =
    typeof body.positionCode === "string" ? body.positionCode.trim() : "";
  const positionTitle =
    typeof body.positionTitle === "string" ? body.positionTitle.trim() : "";

  if (
    positionCode.length < DEMO_PAY_LIMITS.positionCodeLength.min ||
    positionCode.length > DEMO_PAY_LIMITS.positionCodeLength.max
  ) {
    return {
      ok: false,
      error: `positionCode phải từ ${DEMO_PAY_LIMITS.positionCodeLength.min} đến ${DEMO_PAY_LIMITS.positionCodeLength.max} ký tự.`,
    };
  }

  if (
    positionTitle.length < DEMO_PAY_LIMITS.positionTitleLength.min ||
    positionTitle.length > DEMO_PAY_LIMITS.positionTitleLength.max
  ) {
    return {
      ok: false,
      error: `positionTitle phải từ ${DEMO_PAY_LIMITS.positionTitleLength.min} đến ${DEMO_PAY_LIMITS.positionTitleLength.max} ký tự.`,
    };
  }

  const monthlyHours = readHours(body.monthlyHours);

  if (monthlyHours === null) {
    return {
      ok: false,
      error: `monthlyHours phải lớn hơn 0 và không quá ${DEMO_PAY_LIMITS.monthlyHours.max} giờ, tối đa 2 chữ số thập phân.`,
    };
  }

  const hourlyRate = readMoney(
    body.hourlyRate,
    DEMO_PAY_LIMITS.hourlyRate.max,
  );

  if (hourlyRate === null) {
    return {
      ok: false,
      error: `hourlyRate phải là số nguyên từ 0 đến ${DEMO_PAY_LIMITS.hourlyRate.max}.`,
    };
  }

  // The three optional amounts default to 0, which is also the column default — an omitted phụ cấp is a zero,
  // not an error.
  const allowanceAmount = readMoney(
    body.allowanceAmount ?? 0,
    DEMO_PAY_LIMITS.amount.max,
  );
  const bonusAmount = readMoney(body.bonusAmount ?? 0, DEMO_PAY_LIMITS.amount.max);
  const deductionAmount = readMoney(
    body.deductionAmount ?? 0,
    DEMO_PAY_LIMITS.amount.max,
  );

  if (
    allowanceAmount === null ||
    bonusAmount === null ||
    deductionAmount === null
  ) {
    return {
      ok: false,
      error: `allowanceAmount, bonusAmount và deductionAmount phải là số nguyên từ 0 đến ${DEMO_PAY_LIMITS.amount.max}.`,
    };
  }

  const effectiveFrom =
    typeof body.effectiveFrom === "string" ? body.effectiveFrom : "";

  if (!isCalendarDate(effectiveFrom)) {
    return {
      ok: false,
      error: "effectiveFrom phải là ngày hợp lệ dạng YYYY-MM-DD.",
    };
  }

  const note = body.note;

  if (note !== undefined && note !== null && typeof note !== "string") {
    return { ok: false, error: "note phải là chuỗi." };
  }

  if (note && note.length > DEMO_PAY_LIMITS.noteLength) {
    return {
      ok: false,
      error: `note tối đa ${DEMO_PAY_LIMITS.noteLength} ký tự.`,
    };
  }

  // Optional: omitted keeps the stored status on update and answers the column default (ACTIVE) on create.
  const status = body.status;

  if (
    status !== undefined &&
    status !== null &&
    !isDemoPaySalaryStatus(status)
  ) {
    return { ok: false, error: "status phải là ACTIVE hoặc ARCHIVED." };
  }

  return {
    ok: true,
    value: {
      positionCode,
      positionTitle,
      monthlyHours,
      hourlyRate,
      allowanceAmount,
      bonusAmount,
      deductionAmount,
      effectiveFrom,
      note: note ?? null,
      status: isDemoPaySalaryStatus(status) ? status : undefined,
    },
  };
}

/** `body` of `PATCH /api/payroll/demo-salaries/[id]` — the same shape, plus the id that names the row. */
export function parseDemoSalaryPatchBody(
  id: string,
  body: Record<string, unknown>,
): ParseResult<UpdateDemoPaySalaryInput> {
  if (!UUID_PATTERN.test(id)) {
    return { ok: false, error: "id phải là UUID." };
  }

  const parsed = parseDemoSalaryBody(body);

  if (!parsed.ok) {
    return parsed;
  }

  return { ok: true, value: { ...parsed.value, id } };
}
