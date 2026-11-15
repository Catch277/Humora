import type { IDemoPaySalaryRepository } from "@/lib/domain/repositories/IDemoPaySalaryRepository";

/**
 * Ngừng theo dõi một mức lương thử việc mà không xoá nó (SCRUM-100).
 *
 * `ARCHIVED` is the middle option the ticket asks for between "sửa" and "xoá": the row stops counting towards
 * the monitoring totals (`demo_pay_summary` only sums `ACTIVE`) and keeps its figures, so a demo prepared for
 * a meeting can be put away and brought back by editing its status. The unique day rule ignores archived rows
 * (`where status <> 'ARCHIVED'`), so archiving frees that position/day pair for a new row.
 */
export class ArchiveDemoPaySalaryUseCase {
  constructor(private readonly repository: IDemoPaySalaryRepository) {}

  async execute(id: string): Promise<void> {
    return this.repository.archive(id);
  }
}
