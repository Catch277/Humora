import type { PayEstimate } from "@/lib/domain/entities/PayEstimate";
import type { IPayrollRepository } from "@/lib/domain/repositories/IPayrollRepository";

/**
 * "Thu nhập tạm tính" of the caller for one month (SCRUM-90).
 *
 * It answers for every role without a rule of its own: the function reads `auth.uid()` and the caller's
 * latest rate, so an owner who holds no rate simply gets `has_pay_profile: false` — the screen says "chưa
 * có đơn giá giờ" instead of showing `0 ₫` as if no work had been recorded.
 */
export class GetMyPayEstimateUseCase {
  constructor(private readonly payrollRepository: IPayrollRepository) {}

  async execute(periodStart: string): Promise<PayEstimate> {
    return this.payrollRepository.estimate(periodStart);
  }
}
