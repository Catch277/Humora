import type { ContractSummary } from "@/lib/domain/entities/ContractSummary";
import type {
  BillingCycle,
  Contract,
  ContractEffectiveStatus,
  ContractFilters,
  ContractIntent,
  ContractOverview,
  ContractPlan,
  CreateContractInput,
  UpdateContractInput,
} from "@/lib/domain/entities/CustomerContract";
import type {
  CustomerEmail,
  CustomerEmailFilters,
  EmailDirection,
  LogCustomerEmailInput,
} from "@/lib/domain/entities/CustomerEmail";
import { CrmNotFoundError } from "@/lib/domain/errors/CrmNotFoundError";
import type { ICustomerContractRepository } from "@/lib/domain/repositories/ICustomerContractRepository";
import { throwCrmError } from "@/lib/infrastructure/repositories/crmErrors";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

/** `monthly_fee` is read, never written: it is a generated column (SCRUM-101). */
const CONTRACT_COLUMNS =
  "id, organization_id, customer_id, contract_no, plan_code, employee_count, unit_price, monthly_fee, billing_cycle, start_date, end_date, auto_renew, reminder_days, status, terminated_on, termination_reason, renews_contract_id, note, created_at, updated_at";

const EMAIL_COLUMNS =
  "id, organization_id, customer_id, contract_id, direction, subject, counterpart_email, counterpart_name, gmail_thread_id, gmail_message_id, gmail_thread_url, sent_at, snippet, body, created_at";

/** `numeric`/`bigint` arrive as strings through PostgREST; every one is coerced in the mappers. */
type Numeric = number | string;

type ContractRow = {
  id: string;
  organization_id: string;
  customer_id: string;
  contract_no: string;
  plan_code: string;
  employee_count: Numeric;
  unit_price: Numeric;
  monthly_fee: Numeric;
  billing_cycle: string;
  start_date: string;
  end_date: string;
  auto_renew: boolean;
  reminder_days: Numeric;
  status: string;
  terminated_on: string | null;
  termination_reason: string | null;
  renews_contract_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type ContractOverviewRow = ContractRow & {
  customer_name: string;
  app_name: string;
  contact_email: string;
  days_to_end: Numeric;
  effective_status: string;
  cycle_months: Numeric;
  period_amount: Numeric;
  last_reminder_at: string | null;
  email_count: Numeric;
};

type EmailRow = {
  id: string;
  organization_id: string;
  customer_id: string;
  contract_id: string | null;
  direction: string;
  subject: string;
  counterpart_email: string;
  counterpart_name: string | null;
  gmail_thread_id: string | null;
  gmail_message_id: string | null;
  gmail_thread_url: string | null;
  sent_at: string;
  snippet: string | null;
  body: string | null;
  created_at: string;
};

type SummaryRow = Partial<Record<keyof ContractSummary, Numeric>>;

function toContract(row: ContractRow): Contract {
  return {
    id: row.id,
    organization_id: row.organization_id,
    customer_id: row.customer_id,
    contract_no: row.contract_no,
    // The CHECKs of `customer_contracts` keep these inside their unions, so the casts are narrower than the
    // plain text PostgREST returns.
    plan_code: row.plan_code as ContractPlan,
    employee_count: Number(row.employee_count),
    unit_price: Number(row.unit_price),
    monthly_fee: Number(row.monthly_fee),
    billing_cycle: row.billing_cycle as BillingCycle,
    start_date: row.start_date,
    end_date: row.end_date,
    auto_renew: row.auto_renew,
    reminder_days: Number(row.reminder_days),
    status: row.status as ContractIntent,
    terminated_on: row.terminated_on,
    termination_reason: row.termination_reason,
    renews_contract_id: row.renews_contract_id,
    note: row.note,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toOverview(row: ContractOverviewRow): ContractOverview {
  return {
    ...toContract(row),
    customer_name: row.customer_name,
    app_name: row.app_name,
    contact_email: row.contact_email,
    days_to_end: Number(row.days_to_end),
    effective_status: row.effective_status as ContractEffectiveStatus,
    cycle_months: Number(row.cycle_months),
    period_amount: Number(row.period_amount),
    last_reminder_at: row.last_reminder_at,
    email_count: Number(row.email_count ?? 0),
  };
}

function toEmail(row: EmailRow): CustomerEmail {
  return {
    id: row.id,
    organization_id: row.organization_id,
    customer_id: row.customer_id,
    contract_id: row.contract_id,
    direction: row.direction as EmailDirection,
    subject: row.subject,
    counterpart_email: row.counterpart_email,
    counterpart_name: row.counterpart_name,
    gmail_thread_id: row.gmail_thread_id,
    gmail_message_id: row.gmail_message_id,
    gmail_thread_url: row.gmail_thread_url,
    sent_at: row.sent_at,
    snippet: row.snippet,
    body: row.body,
    created_at: row.created_at,
  };
}

/** camelCase input → the snake_case columns the table stores, minus every generated value. */
function contractPayload(input: CreateContractInput) {
  return {
    customer_id: input.customerId,
    contract_no: input.contractNo.trim(),
    plan_code: input.planCode,
    employee_count: input.employeeCount,
    unit_price: input.unitPrice,
    billing_cycle: input.billingCycle,
    start_date: input.startDate,
    end_date: input.endDate,
    auto_renew: input.autoRenew,
    reminder_days: input.reminderDays,
    status: input.status,
    note: input.note,
    renews_contract_id: input.renewsContractId,
  };
}

/**
 * Supabase implementation of contracts and the Gmail correspondence log (SCRUM-101).
 *
 * Every read that needs a derived verdict goes through an RPC (`get_contract_overview`,
 * `get_contract_summary`): "sắp hết hạn" depends on the row's own `reminder_days` and on today in Bangkok,
 * so PostgREST's filters cannot express it. Writes are plain inserts/updates; `monthly_fee` is a generated
 * column and is deliberately absent from `contractPayload`.
 */
export class SupabaseCustomerContractRepository
  implements ICustomerContractRepository
{
  async overview(filters: ContractFilters): Promise<ContractOverview[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_contract_overview", {
      p_status: filters.status ?? null,
      p_customer_id: filters.customerId ?? null,
      p_search: filters.search?.trim() || null,
    });

    if (error) {
      throwCrmError(error, "load the contracts");
    }

    return ((data ?? []) as ContractOverviewRow[]).map(toOverview);
  }

  async findById(id: string): Promise<Contract | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("customer_contracts")
      .select(CONTRACT_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throwCrmError(error, "load the contract");
    }

    return data ? toContract(data as ContractRow) : null;
  }

  async create(input: CreateContractInput): Promise<Contract> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("customer_contracts")
      .insert(contractPayload(input))
      .select(CONTRACT_COLUMNS)
      .single();

    if (error) {
      throwCrmError(error, "create the contract");
    }

    return toContract(data as ContractRow);
  }

  async update(input: UpdateContractInput): Promise<Contract> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("customer_contracts")
      .update(contractPayload(input))
      .eq("id", input.id)
      .select(CONTRACT_COLUMNS)
      .maybeSingle();

    if (error) {
      throwCrmError(error, "update the contract");
    }

    if (!data) {
      throw new CrmNotFoundError(
        "Không tìm thấy hợp đồng này trong tổ chức của bạn.",
      );
    }

    return toContract(data as ContractRow);
  }

  async terminate(
    id: string,
    terminatedOn: string,
    reason: string,
  ): Promise<Contract> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("customer_contracts")
      .update({
        status: "TERMINATED",
        terminated_on: terminatedOn,
        termination_reason: reason.trim(),
      })
      .eq("id", id)
      .select(CONTRACT_COLUMNS)
      .maybeSingle();

    if (error) {
      throwCrmError(error, "terminate the contract");
    }

    if (!data) {
      throw new CrmNotFoundError(
        "Không tìm thấy hợp đồng này trong tổ chức của bạn.",
      );
    }

    return toContract(data as ContractRow);
  }

  async remove(id: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("customer_contracts")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      throwCrmError(error, "delete the contract");
    }

    if (!data) {
      throw new CrmNotFoundError(
        "Không tìm thấy hợp đồng này trong tổ chức của bạn.",
      );
    }
  }

  async summary(): Promise<ContractSummary> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_contract_summary");

    if (error) {
      throwCrmError(error, "load the contract summary");
    }

    const row = (data ?? {}) as SummaryRow;

    return {
      customers_total: Number(row.customers_total ?? 0),
      customers_active: Number(row.customers_active ?? 0),
      contracts_active: Number(row.contracts_active ?? 0),
      contracts_expiring: Number(row.contracts_expiring ?? 0),
      contracts_expired: Number(row.contracts_expired ?? 0),
      mrr: Number(row.mrr ?? 0),
      renewals_due_30: Number(row.renewals_due_30 ?? 0),
    };
  }

  async emails(filters: CustomerEmailFilters): Promise<CustomerEmail[]> {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("customer_emails")
      .select(EMAIL_COLUMNS)
      .order("sent_at", { ascending: false });

    if (filters.customerId) {
      query = query.eq("customer_id", filters.customerId);
    }

    if (filters.contractId) {
      query = query.eq("contract_id", filters.contractId);
    }

    if (filters.direction) {
      query = query.eq("direction", filters.direction);
    }

    const term = filters.search?.trim();

    if (term) {
      // PostgREST's `or` grammar splits on commas and parentheses, so those characters are neutralised
      // rather than injected — the search is a convenience, not a parser.
      const safe = term.replace(/[%,()]/g, " ");

      query = query.or(
        `subject.ilike.%${safe}%,counterpart_email.ilike.%${safe}%,counterpart_name.ilike.%${safe}%`,
      );
    }

    const { data, error } = await query;

    if (error) {
      throwCrmError(error, "load the customer emails");
    }

    return ((data ?? []) as EmailRow[]).map(toEmail);
  }

  async logEmail(input: LogCustomerEmailInput): Promise<CustomerEmail> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("customer_emails")
      .insert({
        customer_id: input.customerId,
        contract_id: input.contractId,
        direction: input.direction,
        subject: input.subject.trim(),
        counterpart_email: input.counterpartEmail.trim(),
        counterpart_name: input.counterpartName,
        gmail_thread_id: input.gmailThreadId,
        gmail_message_id: input.gmailMessageId,
        gmail_thread_url: input.gmailThreadUrl,
        sent_at: input.sentAt,
        snippet: input.snippet,
        body: input.body,
      })
      .select(EMAIL_COLUMNS)
      .single();

    if (error) {
      throwCrmError(error, "log the customer email");
    }

    return toEmail(data as EmailRow);
  }

  async removeEmail(id: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("customer_emails")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      throwCrmError(error, "delete the customer email");
    }

    if (!data) {
      throw new CrmNotFoundError("Không tìm thấy email này để xoá.");
    }
  }

}

