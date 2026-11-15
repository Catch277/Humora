import type { Branch } from "@/lib/domain/entities/Branch";
import type {
  DashboardAggregate,
  DashboardAttendanceSummary,
  DashboardBranchStatistics,
  DashboardPeriod,
  DashboardRevenueBranchPoint,
  DashboardSeriesPoint,
  DashboardStatistics,
  DashboardWorkforceSummary,
} from "@/lib/domain/entities/DashboardStatistics";
import { BranchForbiddenError } from "@/lib/domain/errors/BranchForbiddenError";
import { BranchNotFoundError } from "@/lib/domain/errors/BranchNotFoundError";
import type { IBranchRepository } from "@/lib/domain/repositories/IBranchRepository";
import type { IDashboardStatisticsRepository } from "@/lib/domain/repositories/IDashboardStatisticsRepository";
import {
  branchScopeFrom,
  type BranchCaller,
  type BranchScope,
} from "@/lib/usecases/branchScope";
import { getBusinessDay } from "@/lib/usecases/businessDay";
import {
  formatDateParts,
  getBangkokDateParts,
  getReportRange,
  parseReportDate,
} from "@/lib/usecases/reportRange";

export type GetDashboardStatisticsInput = {
  branchId?: string;
  period: DashboardPeriod;
  date?: string;
};

type Bucket = "day" | "month";

/** One branch as the answer accumulates it: workforce, attendance and revenue in the same shape. */
type BranchAccumulator = {
  branch_id: string | null;
  branch_name: string;
  employee_total: number;
  employee_active: number;
  employee_resigned: number;
  scheduled_total: number;
  no_show_total: number;
  working_employees: number;
  absent_employees: number;
  attendance_total: number;
  on_time: number;
  late: number;
  early_leave: number;
  absent: number;
  incomplete: number;
  revenue_total: number;
  revenue_records: number;
};

/** The map key of the owner's "chưa gán chi nhánh" bucket (`branch_id = null`). */
const UNASSIGNED_KEY = "__unassigned__";

/** A month is 31 buckets and a year 12; this only stops a malformed range from looping forever. */
const MAX_BUCKETS = 400;

const EMPTY_AGGREGATE: DashboardAggregate = {
  employee_total: 0,
  employee_active: 0,
  employee_resigned: 0,
  scheduled_total: 0,
  no_show_total: 0,
  working_employees: 0,
  absent_employees: 0,
  attendance_total: 0,
  on_time: 0,
  late: 0,
  early_leave: 0,
  absent: 0,
  incomplete: 0,
  revenue_total: 0,
  revenue_records: 0,
  attendance_rate: null,
};

/** `48,3` — a share, one decimal, `null` when the denominator is zero (nothing to divide). */
function percentage(part: number, total: number): number | null {
  if (total <= 0) {
    return null;
  }

  return Math.round((part / total) * 1000) / 10;
}

/** The business date (`YYYY-MM-DD`) or month (`YYYY-MM`) a SQL bucket belongs to. */
function bucketKeyOf(instant: string, bucket: Bucket): string {
  const date = new Date(instant);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  if (bucket === "month") {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
    })
      .format(date)
      .slice(0, 7);
  }

  return getBusinessDay(date);
}

/**
 * Every bucket of the range in order, so a day nobody declared revenue still gets a zero column
 * instead of the chart silently closing the gap. The keys are Asia/Bangkok business dates, which is
 * what `bucketKeyOf` produces for the SQL rows too.
 */
function enumerateBuckets(
  startDate: string,
  endDate: string,
  bucket: Bucket,
): string[] {
  const [year, month, day] = startDate.split("-").map(Number);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return [];
  }

  const cursor = new Date(Date.UTC(year, month - 1, day));
  const endKey = bucket === "month" ? endDate.slice(0, 7) : endDate;
  const keys: string[] = [];

  while (keys.length < MAX_BUCKETS) {
    const key =
      bucket === "month"
        ? `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`
        : cursor.toISOString().slice(0, 10);

    keys.push(key);

    if (key >= endKey) {
      break;
    }

    if (bucket === "month") {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    } else {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return keys;
}

function createAccumulator(
  branchId: string | null,
  branchName: string,
): BranchAccumulator {
  return {
    branch_id: branchId,
    branch_name: branchName,
    employee_total: 0,
    employee_active: 0,
    employee_resigned: 0,
    scheduled_total: 0,
    no_show_total: 0,
    working_employees: 0,
    absent_employees: 0,
    attendance_total: 0,
    on_time: 0,
    late: 0,
    early_leave: 0,
    absent: 0,
    incomplete: 0,
    revenue_total: 0,
    revenue_records: 0,
  };
}

function inScope(branchId: string | null, scope: BranchScope): boolean {
  if (scope.all) {
    return true;
  }

  return branchId !== null && scope.ids.has(branchId);
}

function toBranchStatistics(
  entry: BranchAccumulator,
): DashboardBranchStatistics {
  return {
    branch_id: entry.branch_id,
    branch_name: entry.branch_name,
    employee_total: entry.employee_total,
    employee_active: entry.employee_active,
    employee_resigned: entry.employee_resigned,
    scheduled_total: entry.scheduled_total,
    no_show_total: entry.no_show_total,
    working_employees: entry.working_employees,
    absent_employees: entry.absent_employees,
    attendance_total: entry.attendance_total,
    on_time: entry.on_time,
    late: entry.late,
    early_leave: entry.early_leave,
    absent: entry.absent,
    incomplete: entry.incomplete,
    revenue_total: entry.revenue_total,
    revenue_records: entry.revenue_records,
    attendance_rate: percentage(
      entry.attendance_total,
      entry.attendance_total + entry.no_show_total,
    ),
  };
}

/** The organization (or scope) roll-up: the same counters as one branch row, without a branch. */
function aggregateTotals(
  rows: readonly DashboardBranchStatistics[],
): DashboardAggregate {
  const totals = rows.reduce<DashboardAggregate>(
    (sum, row) => ({
      employee_total: sum.employee_total + row.employee_total,
      employee_active: sum.employee_active + row.employee_active,
      employee_resigned: sum.employee_resigned + row.employee_resigned,
      scheduled_total: sum.scheduled_total + row.scheduled_total,
      no_show_total: sum.no_show_total + row.no_show_total,
      working_employees: sum.working_employees + row.working_employees,
      absent_employees: sum.absent_employees + row.absent_employees,
      attendance_total: sum.attendance_total + row.attendance_total,
      on_time: sum.on_time + row.on_time,
      late: sum.late + row.late,
      early_leave: sum.early_leave + row.early_leave,
      absent: sum.absent + row.absent,
      incomplete: sum.incomplete + row.incomplete,
      revenue_total: sum.revenue_total + row.revenue_total,
      revenue_records: sum.revenue_records + row.revenue_records,
      attendance_rate: null,
    }),
    { ...EMPTY_AGGREGATE },
  );

  return {
    ...totals,
    attendance_rate: percentage(
      totals.attendance_total,
      totals.attendance_total + totals.no_show_total,
    ),
  };
}

export class GetDashboardStatisticsUseCase {
  constructor(
    private readonly dashboardRepository: IDashboardStatisticsRepository,
    /**
     * Names for the per-branch chart and the scope a manager's answer is narrowed to (SCRUM-63). Read
     * RLS deliberately lets a manager see the whole organization, so this is where the screen's "the
     * branches I run" rule is applied — the same way `GetEmployeeStatusUseCase` does it.
     */
    private readonly branchRepository: IBranchRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    input: GetDashboardStatisticsInput,
    caller: BranchCaller,
  ): Promise<DashboardStatistics> {
    const now = this.now();
    const anchor = parseReportDate(input.date, now);
    const range = getReportRange(input.period, anchor);
    const bucket: Bucket = range.bucket;

    // Business dates, not instants: the RPCs take `date`, and a Bangkok day is what `work_date` stores.
    const startDate = getBusinessDay(range.start);
    const endDate = getBusinessDay(new Date(range.end.getTime() - 1));

    // The preceding period of the same shape, so the comparison on the revenue card is like-for-like
    // (`GetRevenueReportUseCase` derives it the same way).
    const previousRange = getReportRange(
      input.period,
      getBangkokDateParts(new Date(range.start.getTime() - 1)),
    );
    const previousStartDate = getBusinessDay(previousRange.start);
    const previousEndDate = getBusinessDay(
      new Date(previousRange.end.getTime() - 1),
    );

    // The branch list is read first: it is both the source of the per-branch names and the scope this
    // answer is narrowed to, so an out-of-scope filter is refused before three RPCs run.
    const branches = await this.branchRepository.findAll();
    const scope = branchScopeFrom(branches, caller);
    this.assertBranchInScope(input.branchId, branches, scope);

    const [operations, previousOperations, workforce] = await Promise.all([
      this.dashboardRepository.getOperationSeries({
        branchId: input.branchId,
        startDate,
        endDate,
        bucket,
      }),
      this.dashboardRepository.getOperationSeries({
        branchId: input.branchId,
        startDate: previousStartDate,
        endDate: previousEndDate,
        bucket: previousRange.bucket,
      }),
      this.dashboardRepository.getWorkforce({
        branchId: input.branchId,
        startDate,
        endDate,
      }),
    ]);

    const accumulator = new Map<string, BranchAccumulator>();

    const ensure = (
      branchId: string | null,
      branchName: string | null,
    ): BranchAccumulator => {
      const key = branchId ?? UNASSIGNED_KEY;
      const existing = accumulator.get(key);

      if (existing) {
        // The RPC names the branch; a row that lost its branch (or a declaration whose branch was
        // deleted) keeps whichever name it arrived with.
        if (branchName && existing.branch_name !== branchName) {
          existing.branch_name = branchName;
        }

        return existing;
      }

      const created = createAccumulator(branchId, branchName ?? "");
      accumulator.set(key, created);

      return created;
    };

    // Seed from the branch list so a branch with no employee, no ca and no declaration still gets a
    // row of zeros instead of vanishing from the chart. A filtered screen skips the other branches:
    // they would only be a column of zeroes next to the one being read.
    for (const branch of branches) {
      if (input.branchId && branch.id !== input.branchId) {
        continue;
      }

      if (inScope(branch.id, scope)) {
        ensure(branch.id, branch.name);
      }
    }

    for (const row of workforce) {
      if (!inScope(row.branch_id, scope)) {
        continue;
      }

      const entry = ensure(row.branch_id, row.branch_name);
      entry.employee_total = row.employee_total;
      entry.employee_active = row.employee_active;
      entry.employee_resigned = row.employee_resigned;
      entry.scheduled_total = row.scheduled_total;
      entry.no_show_total = row.no_show_total;
      entry.working_employees = row.working_employees;
      entry.absent_employees = row.absent_employees;
    }

    const series = new Map<string, DashboardSeriesPoint>();

    for (const key of enumerateBuckets(startDate, endDate, bucket)) {
      series.set(key, { bucket: key, total_revenue: 0, record_count: 0 });
    }

    for (const row of operations) {
      if (!inScope(row.branch_id, scope)) {
        continue;
      }

      const entry = ensure(row.branch_id, row.branch_name);
      entry.revenue_total += row.revenue_amount;
      entry.revenue_records += row.revenue_records;
      entry.attendance_total += row.attendance_total;
      entry.on_time += row.on_time;
      entry.late += row.late;
      entry.early_leave += row.early_leave;
      entry.absent += row.absent;
      entry.incomplete += row.incomplete;

      const point = series.get(bucketKeyOf(row.bucket_start, bucket));

      if (point) {
        point.total_revenue += row.revenue_amount;
        point.record_count += row.revenue_records;
      }
    }

    const branchRows = [...accumulator.values()]
      .map(toBranchStatistics)
      .sort((left, right) => {
        // "Chưa gán chi nhánh" is a bucket of the owner's answer, never a branch to compare with.
        if (left.branch_id === null) {
          return 1;
        }

        if (right.branch_id === null) {
          return -1;
        }

        return left.branch_name.localeCompare(right.branch_name, "vi");
      });

    const totals = aggregateTotals(branchRows);
    const seriesPoints = [...series.values()];
    const previousTotal = previousOperations
      .filter((row) => inScope(row.branch_id, scope))
      .reduce((sum, row) => sum + row.revenue_amount, 0);

    const attendance: DashboardAttendanceSummary = {
      recorded: totals.attendance_total,
      on_time: totals.on_time,
      late: totals.late,
      early_leave: totals.early_leave,
      absent: totals.absent,
      incomplete: totals.incomplete,
      no_show: totals.no_show_total,
      total: totals.attendance_total + totals.no_show_total,
      attendance_rate: totals.attendance_rate,
    };

    const workforceSummary: DashboardWorkforceSummary = {
      total: totals.employee_total,
      active: totals.employee_active,
      resigned: totals.employee_resigned,
      working: totals.working_employees,
      absent: totals.absent_employees,
      active_rate: percentage(totals.employee_active, totals.employee_total),
    };

    const byBranch: DashboardRevenueBranchPoint[] = [
      ...accumulator.values(),
    ]
      .map((entry) => ({
        branch_id: entry.branch_id,
        branch_name: entry.branch_name,
        total_revenue: entry.revenue_total,
        record_count: entry.revenue_records,
      }))
      .sort((left, right) => right.total_revenue - left.total_revenue);

    return {
      period: input.period,
      date: formatDateParts(anchor),
      range: {
        start_at: range.start.toISOString(),
        end_at: range.end.toISOString(),
        start_date: startDate,
        end_date: endDate,
      },
      generated_at: now.toISOString(),
      revenue: {
        series: seriesPoints,
        total: totals.revenue_total,
        record_count: totals.revenue_records,
        previous_total: previousTotal,
        // A period with no closed ca has nothing to compare against: `null`, not `0%`.
        percentage_change:
          previousTotal === 0
            ? null
            : ((totals.revenue_total - previousTotal) / previousTotal) * 100,
        by_branch: byBranch,
      },
      attendance,
      workforce: workforceSummary,
      branches: branchRows,
      totals,
    };
  }

  /** `404` for an id the caller cannot see, `403` for another branch's (SCRUM-61). */
  private assertBranchInScope(
    branchId: string | undefined,
    branches: readonly Branch[],
    scope: BranchScope,
  ): void {
    if (!branchId) {
      return;
    }

    const branch = branches.find((candidate) => candidate.id === branchId);

    if (!branch) {
      throw new BranchNotFoundError();
    }

    if (!scope.all && !scope.ids.has(branch.id)) {
      throw new BranchForbiddenError();
    }
  }
}
