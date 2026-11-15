import type {
  DemoPaySalary,
  DemoPaySalaryFilters,
} from "@/lib/domain/entities/DemoPaySalary";
import type { IDemoPaySalaryRepository } from "@/lib/domain/repositories/IDemoPaySalaryRepository";

/**
 * Danh sách lương thử việc để theo dõi (SCRUM-100).
 *
 * The screen passes the filters it offers (position, status) and nothing else: `ALL` is the absence of a
 * filter, never a `status = 'ALL'` value sent to the database.
 */
export class ListDemoPaySalariesUseCase {
  constructor(private readonly repository: IDemoPaySalaryRepository) {}

  async execute(input: {
    positionCode?: string;
    status?: DemoPaySalary["status"];
  }): Promise<DemoPaySalary[]> {
    const filters: DemoPaySalaryFilters = {};

    if (input.positionCode) {
      filters.positionCode = input.positionCode;
    }

    if (input.status) {
      filters.status = input.status;
    }

    return this.repository.findAll(filters);
  }
}
