import type { DemoPaySummary } from "@/lib/domain/entities/DemoPaySalary";
import type { IDemoPaySalaryRepository } from "@/lib/domain/repositories/IDemoPaySalaryRepository";

/**
 * Số liệu theo dõi lương thử việc (SCRUM-100): số dòng theo trạng thái và tổng gross/net của những dòng đang
 * hiệu lực. Tổng do SQL cộng (`demo_pay_summary`), nên con số trên KPI và con số trên bảng không thể lệch.
 */
export class GetDemoPaySummaryUseCase {
  constructor(private readonly repository: IDemoPaySalaryRepository) {}

  async execute(): Promise<DemoPaySummary> {
    return this.repository.summary();
  }
}
