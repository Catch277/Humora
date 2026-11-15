import type { PublishPayslipsResult } from "@/lib/domain/entities/Payslip";
import type { IPayrollRepository } from "@/lib/domain/repositories/IPayrollRepository";

/**
 * Publishes every DRAFT of a finished month (SCRUM-90).
 *
 * A payslip whose employee still has an open khiếu nại on that month's timesheet is **held** instead: a
 * disputed number must never be issued as final, and the answer tells the owner how many were held so the
 * screen can say "x phiếu chờ xử lý khiếu nại" rather than pretending everything went out.
 */
export class PublishPayslipsUseCase {
  constructor(private readonly payrollRepository: IPayrollRepository) {}

  async execute(periodStart: string): Promise<PublishPayslipsResult> {
    return this.payrollRepository.publish(periodStart);
  }
}
