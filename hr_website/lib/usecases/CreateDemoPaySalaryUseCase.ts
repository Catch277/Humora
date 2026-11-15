import type { CreateDemoPaySalaryInput } from "@/lib/domain/entities/DemoPaySalary";
import { PayrollInputError } from "@/lib/domain/errors/PayrollInputError";
import { isDemoSalaryPositionCode } from "@/lib/domain/demoSalaryPositions";
import { PAYROLL_TOKENS, payrollErrorMessage } from "@/lib/domain/payrollMessages";
import type { IDemoPaySalaryRepository } from "@/lib/domain/repositories/IDemoPaySalaryRepository";

/**
 * Thêm một mức lương thử việc (SCRUM-100).
 *
 * The one rule this layer owns: **the position must be one the app knows** — `DEMO_PAY_POSITION_REQUIRED`,
 * a `400` beside the field. It stays here rather than in SQL on purpose: the vocabulary lives in
 * `lib/domain/demoSalaryPositions.ts`, and a CHECK constraint that must match a TypeScript list is exactly the
 * trap `requests_request_type_check` set (SCRUM-62) — the write fails with a `500` the app cannot explain.
 *
 * The rest is the database's: the CHECKs on the amounts, `gross`/`net` computed there, the duplicate day and
 * the audit entry. Money is never multiplied in TypeScript.
 */
export class CreateDemoPaySalaryUseCase {
  constructor(private readonly repository: IDemoPaySalaryRepository) {}

  async execute(input: CreateDemoPaySalaryInput): Promise<string> {
    if (!isDemoSalaryPositionCode(input.positionCode)) {
      throw new PayrollInputError(
        payrollErrorMessage(PAYROLL_TOKENS.demoPositionRequired),
      );
    }

    return this.repository.create(input);
  }
}
