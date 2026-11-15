import type {
  CreateDemoPaySalaryInput,
  DemoPaySalary,
  DemoPaySalaryFilters,
  DemoPaySalaryStatus,
  DemoPaySummary,
  DemoPaySummaryPosition,
  UpdateDemoPaySalaryInput,
} from "@/lib/domain/entities/DemoPaySalary";
import type { IDemoPaySalaryRepository } from "@/lib/domain/repositories/IDemoPaySalaryRepository";
import { throwPayrollError } from "@/lib/infrastructure/repositories/payrollErrors";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

/**
 * `updated_at` is selected on purpose even though SCRUM-92 taught the module to be careful with a new column:
 * that lesson was about adding a column to a table the app already read. This table only exists after
 * `SCRUM-100_demo_pay_salaries.sql`, which creates every column below, so no older database can answer
 * `42703` here.
 */
const DEMO_SALARY_COLUMNS =
  "id, organization_id, position_code, position_title, monthly_hours, hourly_rate, allowance_amount, bonus_amount, deduction_amount, gross_amount, net_amount, effective_from, status, note, created_by, created_at, updated_at";

/** `bigint`/`numeric` columns arrive as strings; `monthly_hours` keeps its two decimals. */
type Numeric = number | string;

type DemoSalaryRow = {
  id: string;
  organization_id: string;
  position_code: string;
  position_title: string;
  monthly_hours: Numeric;
  hourly_rate: Numeric;
  allowance_amount: Numeric;
  bonus_amount: Numeric;
  deduction_amount: Numeric;
  gross_amount: Numeric;
  net_amount: Numeric;
  effective_from: string;
  status: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** The `jsonb` `demo_pay_summary` answers; `to_jsonb` numbers are JSON numbers, coerced once below. */
type DemoSummaryRow = {
  active_records?: Numeric;
  archived_records?: Numeric;
  gross_total?: Numeric;
  net_total?: Numeric;
  positions?: {
    position_code?: string;
    position_title?: string;
    records?: Numeric;
    gross_total?: Numeric;
    net_total?: Numeric;
  }[];
};

function toDemoSalary(row: DemoSalaryRow): DemoPaySalary {
  return {
    id: row.id,
    organization_id: row.organization_id,
    position_code: row.position_code,
    position_title: row.position_title,
    monthly_hours: Number(row.monthly_hours),
    hourly_rate: Number(row.hourly_rate),
    allowance_amount: Number(row.allowance_amount),
    bonus_amount: Number(row.bonus_amount),
    deduction_amount: Number(row.deduction_amount),
    gross_amount: Number(row.gross_amount),
    net_amount: Number(row.net_amount),
    effective_from: row.effective_from,
    // The column carries `check (status in ('DRAFT','ACTIVE','ARCHIVED'))`, so this cast is narrower than
    // the `string` PostgREST sends back.
    status: row.status as DemoPaySalaryStatus,
    note: row.note,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toSummaryPosition(row: {
  position_code?: string;
  position_title?: string;
  records?: Numeric;
  gross_total?: Numeric;
  net_total?: Numeric;
}): DemoPaySummaryPosition {
  return {
    position_code: row.position_code ?? "",
    position_title: row.position_title ?? "",
    records: Number(row.records ?? 0),
    gross_total: Number(row.gross_total ?? 0),
    net_total: Number(row.net_total ?? 0),
  };
}

/**
 * Supabase implementation of the trial-salary catalogue (SCRUM-100).
 *
 * Reads go straight to the table (`demo_pay_salaries_select_owner` narrows them to the owner); every write is
 * an RPC, because `INSERT/UPDATE/DELETE` are revoked from `authenticated` — a client that could write
 * `net_amount` could invent a salary. Nothing here computes money: the two totals are the stored columns.
 */
export class SupabaseDemoPaySalaryRepository implements IDemoPaySalaryRepository {
  async findAll(filters: DemoPaySalaryFilters): Promise<DemoPaySalary[]> {
    const supabase = await createSupabaseServerClient();
    let query = supabase.from("demo_pay_salaries").select(DEMO_SALARY_COLUMNS);

    if (filters.positionCode) {
      query = query.eq("position_code", filters.positionCode);
    }

    if (filters.status) {
      query = query.eq("status", filters.status);
    }

    // Newest effective date first, then the newest row: the screen reads the answer as a history.
    const { data, error } = await query
      .order("effective_from", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Unable to load the demo salaries: ${error.message}`);
    }

    return ((data ?? []) as unknown as DemoSalaryRow[]).map(toDemoSalary);
  }

  async create(input: CreateDemoPaySalaryInput): Promise<string> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_demo_pay_salary", {
      p_position_code: input.positionCode,
      p_position_title: input.positionTitle,
      p_monthly_hours: input.monthlyHours,
      p_hourly_rate: input.hourlyRate,
      p_allowance_amount: input.allowanceAmount,
      p_bonus_amount: input.bonusAmount,
      p_deduction_amount: input.deductionAmount,
      p_effective_from: input.effectiveFrom,
      p_note: input.note,
      p_status: input.status ?? null,
    });

    if (error) {
      throwPayrollError(error, "create the demo salary");
    }

    if (!data) {
      throw new Error("create_demo_pay_salary answered no id.");
    }

    return String(data);
  }

  async update(input: UpdateDemoPaySalaryInput): Promise<string> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("update_demo_pay_salary", {
      p_id: input.id,
      p_position_code: input.positionCode,
      p_position_title: input.positionTitle,
      p_monthly_hours: input.monthlyHours,
      p_hourly_rate: input.hourlyRate,
      p_allowance_amount: input.allowanceAmount,
      p_bonus_amount: input.bonusAmount,
      p_deduction_amount: input.deductionAmount,
      p_effective_from: input.effectiveFrom,
      p_note: input.note,
      p_status: input.status ?? null,
    });

    if (error) {
      throwPayrollError(error, "update the demo salary");
    }

    if (!data) {
      throw new Error("update_demo_pay_salary answered no id.");
    }

    return String(data);
  }

  async archive(id: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("archive_demo_pay_salary", {
      p_id: id,
    });

    if (error) {
      throwPayrollError(error, "archive the demo salary");
    }
  }

  async remove(id: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("delete_demo_pay_salary", {
      p_id: id,
    });

    if (error) {
      throwPayrollError(error, "delete the demo salary");
    }
  }

  async summary(): Promise<DemoPaySummary> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("demo_pay_summary");

    if (error) {
      throwPayrollError(error, "load the demo salary summary");
    }

    const row = (data ?? {}) as DemoSummaryRow;

    return {
      active_records: Number(row.active_records ?? 0),
      archived_records: Number(row.archived_records ?? 0),
      gross_total: Number(row.gross_total ?? 0),
      net_total: Number(row.net_total ?? 0),
      positions: (row.positions ?? []).map(toSummaryPosition),
    };
  }
}
