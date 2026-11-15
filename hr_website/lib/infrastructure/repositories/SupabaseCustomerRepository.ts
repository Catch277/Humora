import type {
  CreateCustomerInput,
  Customer,
  CustomerFilters,
  CustomerOverview,
  CustomerStatus,
  UpdateCustomerInput,
} from "@/lib/domain/entities/Customer";
import type {
  CreateCustomerLeadInput,
  CustomerLead,
  CustomerLeadFilters,
  LeadStatus,
  UpdateCustomerLeadInput,
} from "@/lib/domain/entities/CustomerLead";
import { CrmNotFoundError } from "@/lib/domain/errors/CrmNotFoundError";
import type { ICustomerRepository } from "@/lib/domain/repositories/ICustomerRepository";
import { throwCrmError } from "@/lib/infrastructure/repositories/crmErrors";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

const CUSTOMER_COLUMNS =
  "id, organization_id, company_name, app_name, contact_name, contact_email, contact_phone, address, tax_code, status, notes, created_at, updated_at";

const LEAD_COLUMNS =
  "id, organization_id, company_name, contact_name, contact_email, contact_phone, employee_count, plan_interest, message, source, status, received_at, converted_customer_id, note, created_at, updated_at";

/** PostgREST answers a `numeric` as a string; the row type normalises it once below. */
type Numeric = number | string;

type CustomerRow = {
  id: string;
  organization_id: string;
  company_name: string;
  app_name: string;
  contact_name: string | null;
  contact_email: string;
  contact_phone: string | null;
  address: string | null;
  tax_code: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type CustomerOverviewRow = CustomerRow & {
  active_contracts: Numeric;
  monthly_total: Numeric;
  next_end_date: string | null;
};

type LeadRow = {
  id: string;
  organization_id: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string;
  contact_phone: string | null;
  employee_count: Numeric | null;
  plan_interest: string | null;
  message: string | null;
  source: string;
  status: string;
  received_at: string;
  converted_customer_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    organization_id: row.organization_id,
    company_name: row.company_name,
    app_name: row.app_name,
    contact_name: row.contact_name,
    contact_email: row.contact_email,
    contact_phone: row.contact_phone,
    address: row.address,
    tax_code: row.tax_code,
    // The column carries `check (status in (...))`, so this cast is narrower than the text PostgREST sends.
    status: row.status as CustomerStatus,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toOverview(row: CustomerOverviewRow): CustomerOverview {
  return {
    ...toCustomer(row),
    active_contracts: Number(row.active_contracts ?? 0),
    monthly_total: Number(row.monthly_total ?? 0),
    next_end_date: row.next_end_date,
  };
}

function payloadOf(input: CreateCustomerInput) {
  return {
    company_name: input.companyName.trim(),
    app_name: input.appName.trim(),
    contact_name: input.contactName,
    contact_email: input.contactEmail.trim(),
    contact_phone: input.contactPhone,
    address: input.address,
    tax_code: input.taxCode,
    status: input.status,
    notes: input.notes,
  };
}

function toLead(row: LeadRow): CustomerLead {
  return {
    id: row.id,
    organization_id: row.organization_id,
    company_name: row.company_name,
    contact_name: row.contact_name,
    contact_email: row.contact_email,
    contact_phone: row.contact_phone,
    employee_count:
      row.employee_count === null ? null : Number(row.employee_count),
    plan_interest: row.plan_interest,
    message: row.message,
    source: row.source,
    // The column carries a CHECK over the five statuses, so the cast is narrower than the text sent back.
    status: row.status as LeadStatus,
    received_at: row.received_at,
    converted_customer_id: row.converted_customer_id,
    note: row.note,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function leadPayloadOf(input: CreateCustomerLeadInput) {
  return {
    company_name: input.companyName.trim(),
    contact_name: input.contactName,
    contact_email: input.contactEmail.trim(),
    contact_phone: input.contactPhone,
    employee_count: input.employeeCount,
    plan_interest: input.planInterest,
    message: input.message,
    source: input.source,
    status: input.status,
    note: input.note,
  };
}

/**
 * Supabase implementation of the customer book (SCRUM-101).
 *
 * The list is the RPC `get_customer_overview(...)`, not a table read: the active-contract count, the monthly
 * total and the next end date are derived there, so the KPI strip and the table cannot disagree about the
 * same customer. Writes are row CRUD under `customers_owner_all` — the RLS policy is what decides, and the
 * unique indexes are translated into sentences the dialog can show.
 */
export class SupabaseCustomerRepository implements ICustomerRepository {
  async findAll(filters: CustomerFilters): Promise<CustomerOverview[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_customer_overview", {
      p_status: filters.status ?? null,
      p_search: filters.search?.trim() || null,
    });

    if (error) {
      throwCrmError(error, "load the customers");
    }

    return ((data ?? []) as CustomerOverviewRow[]).map(toOverview);
  }

  async findById(id: string): Promise<Customer | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("customers")
      .select(CUSTOMER_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throwCrmError(error, "load the customer");
    }

    return data ? toCustomer(data as CustomerRow) : null;
  }

  async create(input: CreateCustomerInput): Promise<Customer> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("customers")
      .insert(payloadOf(input))
      .select(CUSTOMER_COLUMNS)
      .single();

    if (error) {
      throwCrmError(error, "create the customer");
    }

    return toCustomer(data as CustomerRow);
  }

  async update(id: string, input: UpdateCustomerInput): Promise<Customer> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("customers")
      .update(payloadOf(input))
      .eq("id", id)
      .select(CUSTOMER_COLUMNS)
      .maybeSingle();

    if (error) {
      throwCrmError(error, "update the customer");
    }

    // RLS hides rows the caller may not update, so "no row" covers both a wrong id and a forbidden write.
    if (!data) {
      throw new CrmNotFoundError(
        "Không tìm thấy khách hàng này trong tổ chức của bạn.",
      );
    }

    return toCustomer(data as CustomerRow);
  }

  async remove(id: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("customers")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      throwCrmError(error, "delete the customer");
    }

    if (!data) {
      throw new CrmNotFoundError(
        "Không tìm thấy khách hàng này trong tổ chức của bạn.",
      );
    }
  }

  async findLeads(filters: CustomerLeadFilters): Promise<CustomerLead[]> {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("customer_leads")
      .select(LEAD_COLUMNS)
      .order("received_at", { ascending: false });

    if (filters.status) {
      query = query.eq("status", filters.status);
    }

    const term = filters.search?.trim();

    if (term) {
      // Same neutralisation the e-mail search uses: PostgREST's `or` grammar splits on `,` and `(`.
      const safe = term.replace(/[%,()]/g, " ");

      query = query.or(
        `company_name.ilike.%${safe}%,contact_name.ilike.%${safe}%,contact_email.ilike.%${safe}%`,
      );
    }

    const { data, error } = await query;

    if (error) {
      throwCrmError(error, "load the demo requests");
    }

    return ((data ?? []) as LeadRow[]).map(toLead);
  }

  async createLead(input: CreateCustomerLeadInput): Promise<CustomerLead> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("customer_leads")
      .insert(leadPayloadOf(input))
      .select(LEAD_COLUMNS)
      .single();

    if (error) {
      throwCrmError(error, "create the demo request");
    }

    return toLead(data as LeadRow);
  }

  async updateLead(
    id: string,
    input: UpdateCustomerLeadInput,
  ): Promise<CustomerLead> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("customer_leads")
      .update({
        status: input.status,
        note: input.note,
        converted_customer_id: input.convertedCustomerId,
      })
      .eq("id", id)
      .select(LEAD_COLUMNS)
      .maybeSingle();

    if (error) {
      throwCrmError(error, "update the demo request");
    }

    if (!data) {
      throw new CrmNotFoundError(
        "Không tìm thấy yêu cầu demo này trong tổ chức của bạn.",
      );
    }

    return toLead(data as LeadRow);
  }

  async removeLead(id: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("customer_leads")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      throwCrmError(error, "delete the demo request");
    }

    if (!data) {
      throw new CrmNotFoundError(
        "Không tìm thấy yêu cầu demo này trong tổ chức của bạn.",
      );
    }
  }
}
