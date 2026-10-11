import type {
  EmployeeStatus,
  EmployeeStatusFilters,
} from "@/lib/domain/entities/EmployeeStatus";
import type { IEmployeeStatusRepository } from "@/lib/domain/repositories/IEmployeeStatusRepository";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";
import { branchScopeOf, type BranchCaller } from "@/lib/usecases/branchScope";
import { getBusinessDay } from "@/lib/usecases/businessDay";

export type EmployeeStatusSnapshot = {
  /** When the snapshot was taken, so the screen can show "cập nhật lúc ...". */
  updatedAt: string;
  /** The business day (Asia/Bangkok) the snapshot describes. */
  workDate: string;
  statuses: EmployeeStatus[];
};

export class GetEmployeeStatusUseCase {
  constructor(
    private readonly employeeStatusRepository: IEmployeeStatusRepository,
    /**
     * The roster is organization-wide in the database (SCRUM-60 lets a manager read every row), so the
     * screen's own scope has to come from here (SCRUM-63): a branch head watches the people of the
     * branches they run, not somebody else's roster.
     */
    private readonly branchRepository: IBranchRepository,
    // Nondeterminism is injected so the snapshot timestamp stays testable.
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    filters: EmployeeStatusFilters,
    caller: BranchCaller,
  ): Promise<EmployeeStatusSnapshot> {
    const now = this.now();
    const rows = await this.employeeStatusRepository.findAll(filters);
    const statuses = await this.scopeToHeadedBranches(rows, caller);

    return {
      updatedAt: now.toISOString(),
      // The RPC answers for one business day; when nobody is listed the day still has to be
      // shown, so it is derived here with the same Asia/Bangkok rule.
      workDate: statuses[0]?.work_date ?? filters.workDate ?? getBusinessDay(now),
      statuses,
    };
  }

  /**
   * The owner sees the whole organization — including the accounts that belong to no branch yet, which
   * is exactly who they still have to assign on /staff. Every other caller is filtered to the branches
   * they head, and an account that was never assigned to one is therefore not on their roster.
   */
  private async scopeToHeadedBranches(
    statuses: EmployeeStatus[],
    caller: BranchCaller,
  ): Promise<EmployeeStatus[]> {
    const scope = await branchScopeOf(this.branchRepository, caller);

    if (scope.all) {
      return statuses;
    }

    return statuses.filter(
      (status) => status.branch_id !== null && scope.ids.has(status.branch_id),
    );
  }
}