import type { PayEstimate } from "@/lib/domain/entities/PayEstimate";
import type {
  PayProfile,
  SetPayProfileInput,
  UpdatePayProfileInput,
} from "@/lib/domain/entities/PayProfile";
import type { PayslipDetail } from "@/lib/domain/entities/PayslipDetail";
import type { AddPayslipItemInput, PayslipItem } from "@/lib/domain/entities/PayslipItem";
import type { PayslipWorkLine } from "@/lib/domain/entities/PayslipWorkLine";
import type {
  PayrollReconciliationRow,
  PayrollSyncOptions,
  PayrollSyncResult,
} from "@/lib/domain/entities/PayrollReconciliation";
import {
  summariseReconciliation,
  summariseSync,
  type PayrollReconciliation,
} from "@/lib/domain/entities/PayrollReconciliation";
import type {
  Payslip,
  PayslipFilters,
  PayslipStatus,
  PublishPayslipsResult,
  SetPayslipNetInput,
} from "@/lib/domain/entities/Payslip";
import type { IPayrollRepository } from "@/lib/domain/repositories/IPayrollRepository";
import { throwPayrollError } from "@/lib/infrastructure/repositories/payrollErrors";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

const PAY_PROFILE_COLUMNS =
  "id, organization_id, employee_id, hourly_rate, overtime_multiplier, fixed_allowance, effective_from, note, created_at";

const PAYSLIP_COLUMNS =
  "id, organization_id, employee_id, branch_id, period_start, period_end, status, regular_minutes, overtime_minutes, shifts_counted, shifts_skipped, work_amount, other_earnings, gross_amount, deduction_amount, net_amount, generated_at, published_at, published_by, acknowledged_at, dispute_note, disputed_at, dispute_resolved_at, void_reason, voided_at, created_at, updated_at";

const WORK_LINE_COLUMNS =
  "id, payslip_id, attendance_id, work_date, shift_name, minutes, is_overtime, hourly_rate, multiplier, amount";

const ITEM_COLUMNS = "id, payslip_id, kind, code, label, amount, source, created_at";

/** A `bigint`/`numeric` column arrives as a string; every mapper below runs it through `Number`. */
type Numeric = number | string;

type PayProfileRow = {
  id: string;
  organization_id: string;
  employee_id: string;
  hourly_rate: Numeric;
  overtime_multiplier: Numeric;
  fixed_allowance: Numeric;
  effective_from: string;
  note: string | null;
  created_at: string;
};

type PayslipRow = {
  id: string;
  organization_id: string;
  employee_id: string;
  branch_id: string | null;
  period_start: string;
  period_end: string;
  status: string;
  regular_minutes: Numeric;
  overtime_minutes: Numeric;
  shifts_counted: Numeric;
  shifts_skipped: Numeric;
  work_amount: Numeric;
  other_earnings: Numeric;
  gross_amount: Numeric;
  deduction_amount: Numeric;
  net_amount: Numeric;
  generated_at: string;
  published_at: string | null;
  published_by: string | null;
  acknowledged_at: string | null;
  dispute_note: string | null;
  disputed_at: string | null;
  dispute_resolved_at: string | null;
  void_reason: string | null;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
};

type WorkLineRow = {
  id: string;
  payslip_id: string;
  attendance_id: string | null;
  work_date: string;
  shift_name: string | null;
  minutes: Numeric;
  is_overtime: boolean;
  hourly_rate: Numeric;
  multiplier: Numeric;
  amount: Numeric;
};

type PayslipItemRow = {
  id: string;
  payslip_id: string;
  kind: string;
  code: string;
  label: string;
  amount: Numeric;
  source: string;
  created_at: string;
};

/**
 * The `jsonb` `publish_payslips` answers. Declared locally because the client has no generated Database
 * type; both keys are always written by the function ({ published, held_for_complaints }).
 */
type PublishResultRow = {
  published?: Numeric;
  held_for_complaints?: Numeric;
};

/** One row of `my_pay_estimate`, whose `integer`/`bigint` columns also arrive as strings. */
type PayEstimateRow = {
  period_start: string;
  period_end: string;
  has_pay_profile: boolean;
  regular_minutes: Numeric;
  overtime_minutes: Numeric;
  shifts_counted: Numeric;
  shifts_skipped: Numeric;
  work_amount: Numeric;
  allowance_amount: Numeric;
  gross_estimate: Numeric;
};

/**
 * One row of `payroll_reconcile` (SCRUM-99). Every money/counter column is `bigint`/`integer`, so PostgREST
 * hands it back as a string; `flags` is a `text[]` and arrives as a JSON array (or `null` for no flags).
 */
type ReconcileRow = {
  employee_id: string;
  full_name: string | null;
  branch_id: string | null;
  payslip_id: string | null;
  status: string | null;
  stored_work_amount: Numeric;
  computed_work_amount: Numeric;
  stored_allowance: Numeric;
  computed_allowance: Numeric;
  manual_earning: Numeric;
  manual_deduction: Numeric;
  adjustment_amount: Numeric;
  stored_net: Numeric;
  computed_net: Numeric;
  delta: Numeric;
  shifts_counted: Numeric;
  shifts_skipped: Numeric;
  computed_counted: Numeric;
  computed_skipped: Numeric;
  regular_minutes: Numeric;
  overtime_minutes: Numeric;
  open_shifts: Numeric;
  flags: string[] | null;
};

/** One row of `payroll_sync`. */
type SyncRow = {
  employee_id: string;
  action: string;
  reason: string;
  before_net: Numeric;
  after_net: Numeric;
  delta: Numeric;
};

function toReconcileRow(row: ReconcileRow): PayrollReconciliationRow {
  return {
    employee_id: row.employee_id,
    full_name: row.full_name,
    branch_id: row.branch_id,
    payslip_id: row.payslip_id,
    status: row.status,
    stored_work_amount: Number(row.stored_work_amount),
    computed_work_amount: Number(row.computed_work_amount),
    stored_allowance: Number(row.stored_allowance),
    computed_allowance: Number(row.computed_allowance),
    manual_earning: Number(row.manual_earning),
    manual_deduction: Number(row.manual_deduction),
    adjustment_amount: Number(row.adjustment_amount),
    stored_net: Number(row.stored_net),
    computed_net: Number(row.computed_net),
    delta: Number(row.delta),
    shifts_counted: Number(row.shifts_counted),
    shifts_skipped: Number(row.shifts_skipped),
    computed_counted: Number(row.computed_counted),
    computed_skipped: Number(row.computed_skipped),
    regular_minutes: Number(row.regular_minutes),
    overtime_minutes: Number(row.overtime_minutes),
    open_shifts: Number(row.open_shifts),
    // A flag this build does not know is kept: the screen renders it verbatim instead of hiding the row.
    flags: row.flags ?? [],
  };
}

function toPayProfile(row: PayProfileRow): PayProfile {
  return {
    id: row.id,
    organization_id: row.organization_id,
    employee_id: row.employee_id,
    hourly_rate: Number(row.hourly_rate),
    overtime_multiplier: Number(row.overtime_multiplier),
    fixed_allowance: Number(row.fixed_allowance),
    effective_from: row.effective_from,
    note: row.note,
    created_at: row.created_at,
  };
}

function toPayslip(row: PayslipRow): Payslip {
  return {
    id: row.id,
    organization_id: row.organization_id,
    employee_id: row.employee_id,
    branch_id: row.branch_id,
    period_start: row.period_start,
    period_end: row.period_end,
    // The column carries the CHECK `status in ('DRAFT','PUBLISHED','VOID')`, so this cast is narrower
    // than the `string` PostgREST sends back.
    status: row.status as PayslipStatus,
    regular_minutes: Number(row.regular_minutes),
    overtime_minutes: Number(row.overtime_minutes),
    shifts_counted: Number(row.shifts_counted),
    shifts_skipped: Number(row.shifts_skipped),
    work_amount: Number(row.work_amount),
    other_earnings: Number(row.other_earnings),
    gross_amount: Number(row.gross_amount),
    deduction_amount: Number(row.deduction_amount),
    net_amount: Number(row.net_amount),
    generated_at: row.generated_at,
    published_at: row.published_at,
    published_by: row.published_by,
    acknowledged_at: row.acknowledged_at,
    dispute_note: row.dispute_note,
    disputed_at: row.disputed_at,
    dispute_resolved_at: row.dispute_resolved_at,
    void_reason: row.void_reason,
    voided_at: row.voided_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toWorkLine(row: WorkLineRow): PayslipWorkLine {
  return {
    id: row.id,
    payslip_id: row.payslip_id,
    attendance_id: row.attendance_id,
    work_date: row.work_date,
    shift_name: row.shift_name,
    minutes: Number(row.minutes),
    is_overtime: row.is_overtime,
    hourly_rate: Number(row.hourly_rate),
    multiplier: Number(row.multiplier),
    amount: Number(row.amount),
  };
}

function toPayslipItem(row: PayslipItemRow): PayslipItem {
  return {
    id: row.id,
    payslip_id: row.payslip_id,
    // Both columns carry a CHECK: `kind in ('EARNING','DEDUCTION')`, `source in ('AUTO','MANUAL')`.
    kind: row.kind as PayslipItem["kind"],
    code: row.code,
    label: row.label,
    amount: Number(row.amount),
    source: row.source as PayslipItem["source"],
    created_at: row.created_at,
  };
}

function toPayEstimate(row: PayEstimateRow): PayEstimate {
  return {
    period_start: row.period_start,
    period_end: row.period_end,
    has_pay_profile: row.has_pay_profile,
    regular_minutes: Number(row.regular_minutes),
    overtime_minutes: Number(row.overtime_minutes),
    shifts_counted: Number(row.shifts_counted),
    shifts_skipped: Number(row.shifts_skipped),
    work_amount: Number(row.work_amount),
    allowance_amount: Number(row.allowance_amount),
    gross_estimate: Number(row.gross_estimate),
  };
}

/**
 * The only implementation of the payroll repository (SCRUM-90).
 *
 * Two decisions are worth knowing before changing it:
 *
 * - **No embedded selects.** `payslips` points at `users` twice (`employee_id`, `published_by`), so an
 *   unqualified `employee:users (…)` embed answers `PGRST201`; the screen already holds the staff
 *   directory (`GET /api/users`) and the branch list (`GET /api/branches`) and resolves both names there.
 * - **No client-side arithmetic.** Nothing here computes an amount: `generate`, `addItem`, `removeItem`
 *   and `estimate` all defer to the database, which is why a screen refresh can never show a total the
 *   payslip does not hold.
 */
export class SupabasePayrollRepository implements IPayrollRepository {
  async findProfiles(): Promise<PayProfile[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("pay_profiles")
      .select(PAY_PROFILE_COLUMNS)
      .order("effective_from", { ascending: false });

    if (error) {
      throw new Error(`Unable to load pay profiles: ${error.message}`);
    }

    return ((data ?? []) as PayProfileRow[]).map(toPayProfile);
  }

  async findPayslips(filters: PayslipFilters): Promise<Payslip[]> {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("payslips")
      .select(PAYSLIP_COLUMNS)
      .eq("period_start", filters.period);

    if (filters.employeeId) {
      query = query.eq("employee_id", filters.employeeId);
    }

    const { data, error } = await query.order("employee_id", {
      ascending: true,
    });

    if (error) {
      throw new Error(`Unable to load the payslips: ${error.message}`);
    }

    return ((data ?? []) as PayslipRow[]).map(toPayslip);
  }

  async findPayslip(id: string): Promise<PayslipDetail | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("payslips")
      .select(PAYSLIP_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load the payslip: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    const [lines, items] = await Promise.all([
      supabase
        .from("payslip_work_lines")
        .select(WORK_LINE_COLUMNS)
        .eq("payslip_id", id)
        .order("work_date", { ascending: true }),
      supabase
        .from("payslip_items")
        .select(ITEM_COLUMNS)
        .eq("payslip_id", id)
        .order("created_at", { ascending: true }),
    ]);

    if (lines.error) {
      throw new Error(
        `Unable to load the payslip work lines: ${lines.error.message}`,
      );
    }

    if (items.error) {
      throw new Error(`Unable to load the payslip items: ${items.error.message}`);
    }

    return {
      payslip: toPayslip(data as PayslipRow),
      work_lines: ((lines.data ?? []) as WorkLineRow[]).map(toWorkLine),
      items: ((items.data ?? []) as PayslipItemRow[]).map(toPayslipItem),
    };
  }

  async estimate(periodStart: string): Promise<PayEstimate> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("my_pay_estimate", {
      p_month: periodStart,
    });

    if (error) {
      throwPayrollError(error, "load the pay estimate");
    }

    // `my_pay_estimate` returns a table, so PostgREST hands back an array with exactly one row.
    const rows = (data ?? []) as unknown as PayEstimateRow[];
    const row = rows[0];

    if (!row) {
      throw new Error("The pay estimate answered no row for a signed-in caller.");
    }

    return toPayEstimate(row);
  }

  async setProfile(input: SetPayProfileInput): Promise<string> {
    const supabase = await createSupabaseServerClient();
    // Every identity field (organization, actor) is read from the session inside `set_pay_profile`; the
    // payload only names *whose* rate and *what* rate, which is why no id here can point at another tenant.
    const { data, error } = await supabase.rpc("set_pay_profile", {
      p_employee_id: input.employeeId,
      p_hourly_rate: input.hourlyRate,
      p_effective_from: input.effectiveFrom,
      p_overtime_multiplier: input.overtimeMultiplier,
      p_fixed_allowance: input.fixedAllowance,
      p_note: input.note,
    });

    if (error) {
      throwPayrollError(error, "save the pay profile");
    }

    if (!data) {
      throw new Error("set_pay_profile answered no payslip id.");
    }

    return String(data);
  }

  async updateProfile(input: UpdatePayProfileInput): Promise<string> {
    const supabase = await createSupabaseServerClient();
    // SCRUM-92: the row is named by id, and `update_pay_profile` re-reads its organization from the session,
    // so an id from another tenant matches no row and answers `PAY_PROFILE_NOT_FOUND` rather than editing it.
    const { data, error } = await supabase.rpc("update_pay_profile", {
      p_id: input.id,
      p_hourly_rate: input.hourlyRate,
      p_effective_from: input.effectiveFrom,
      p_overtime_multiplier: input.overtimeMultiplier,
      p_fixed_allowance: input.fixedAllowance,
      p_note: input.note,
    });

    if (error) {
      throwPayrollError(error, "update the pay profile");
    }

    if (!data) {
      throw new Error("update_pay_profile answered no id.");
    }

    return String(data);
  }

  async deleteProfile(id: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("delete_pay_profile", { p_id: id });

    if (error) {
      throwPayrollError(error, "delete the pay profile");
    }
  }

  async setNet(payslipId: string, input: SetPayslipNetInput): Promise<number> {
    const supabase = await createSupabaseServerClient();
    // SCRUM-93: the RPC keeps the payslip's arithmetic honest — it stores the difference as one ADJUSTMENT
    // item and recalculates — so the answer is the figure the row now carries, not the one we asked for. A
    // published payslip is refused there (`PAYSLIP_IMMUTABLE` → 409), which is why nothing is checked here.
    const { data, error } = await supabase.rpc("set_payslip_net", {
      p_payslip_id: payslipId,
      p_target_net: input.targetNet,
      p_note: input.note,
    });

    if (error) {
      throwPayrollError(error, "set the payslip net");
    }

    return Number((data as number | string | null) ?? 0);
  }

  async generate(periodStart: string, employeeId?: string): Promise<number> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("generate_payslips", {
      p_period_start: periodStart,
      p_employee_id: employeeId ?? null,
    });

    if (error) {
      throwPayrollError(error, "generate the payslips");
    }

    return Number((data as number | string | null) ?? 0);
  }

  async publish(periodStart: string): Promise<PublishPayslipsResult> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("publish_payslips", {
      p_period_start: periodStart,
    });

    if (error) {
      throwPayrollError(error, "publish the payslips");
    }

    const row = (data ?? {}) as PublishResultRow;

    return {
      published: Number(row.published ?? 0),
      held_for_complaints: Number(row.held_for_complaints ?? 0),
    };
  }

  async addItem(payslipId: string, item: AddPayslipItemInput): Promise<string> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("add_payslip_item", {
      p_payslip_id: payslipId,
      p_kind: item.kind,
      p_code: item.code,
      p_label: item.label,
      p_amount: item.amount,
    });

    if (error) {
      throwPayrollError(error, "add the payslip item");
    }

    if (!data) {
      throw new Error("add_payslip_item answered no item id.");
    }

    return String(data);
  }

  async removeItem(itemId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("remove_payslip_item", {
      p_item_id: itemId,
    });

    if (error) {
      throwPayrollError(error, "remove the payslip item");
    }
  }

  async voidPayslip(payslipId: string, reason: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("void_payslip", {
      p_payslip_id: payslipId,
      p_reason: reason,
    });

    if (error) {
      throwPayrollError(error, "void the payslip");
    }
  }

  async resolveDispute(payslipId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("resolve_payslip_dispute", {
      p_payslip_id: payslipId,
    });

    if (error) {
      throwPayrollError(error, "resolve the payslip dispute");
    }
  }

  async acknowledge(payslipId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    // Both employee functions scope themselves to `employee_id = auth.uid()`; a payslip id belonging to
    // somebody else therefore matches no row and answers `PAYSLIP_NOT_FOUND`, not a silent success.
    const { error } = await supabase.rpc("acknowledge_payslip", {
      p_payslip_id: payslipId,
    });

    if (error) {
      throwPayrollError(error, "acknowledge the payslip");
    }
  }

  async dispute(payslipId: string, note: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("dispute_payslip", {
      p_payslip_id: payslipId,
      p_note: note,
    });

    if (error) {
      throwPayrollError(error, "dispute the payslip");
    }
  }

  async reconcile(periodStart: string): Promise<PayrollReconciliation> {
    const supabase = await createSupabaseServerClient();
    // SCRUM-99: read-only. The RPC recomputes the month with `payroll_work_lines()` and answers it next to
    // what is stored, so this call writes nothing and cannot change a payslip.
    const { data, error } = await supabase.rpc("payroll_reconcile", {
      p_period_start: periodStart,
    });

    if (error) {
      throwPayrollError(error, "reconcile the payroll");
    }

    // A `returns table` function arrives as an array; an empty month answers `[]`, which is a valid answer.
    const rows = ((data ?? []) as unknown as ReconcileRow[]).map(toReconcileRow);

    return {
      period_start: periodStart,
      rows,
      summary: summariseReconciliation(rows),
    };
  }

  async sync(
    periodStart: string,
    options: PayrollSyncOptions,
  ): Promise<PayrollSyncResult> {
    const supabase = await createSupabaseServerClient();
    // `p_apply` defaults to false in SQL as well, so a caller that forgets the flag gets the dry run: the
    // harmless answer is the default on both sides of the wire.
    const { data, error } = await supabase.rpc("payroll_sync", {
      p_period_start: periodStart,
      p_employee_id: options.employeeId ?? null,
      p_apply: options.apply,
    });

    if (error) {
      throwPayrollError(error, "sync the payroll");
    }

    const rows = ((data ?? []) as unknown as SyncRow[]).map((row) => ({
      employee_id: row.employee_id,
      action: row.action,
      reason: row.reason,
      before_net: Number(row.before_net),
      after_net: Number(row.after_net),
      delta: Number(row.delta),
    }));

    return {
      period_start: periodStart,
      applied: options.apply,
      rows,
      ...summariseSync(rows),
    };
  }
}
