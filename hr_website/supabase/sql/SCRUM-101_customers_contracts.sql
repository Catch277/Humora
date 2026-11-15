-- SCRUM-101: Khách hàng & hợp đồng (C4) + nhật ký email theo hợp đồng (C3).
-- Run in Supabase Dashboard > SQL Editor, after SCRUM-51/59/63. Idempotent: safe to re-run.
--
-- Why this module is its own aggregate:
--
--   * A "customer" here is an organization that BOUGHT the HR product, not an employee and not a branch.
--     It therefore carries its own contact data, its registered App name and its contracts, and it is
--     deliberately not attached to `branches` (a chi nhánh is where staff work, a customer is who pays).
--   * Money is computed in SQL only. `monthly_fee` is a **generated column** derived from the per-person
--     price and the headcount, so no client can send a fee that disagrees with its parts — the same rule
--     SCRUM-90/100 apply to payroll, expressed as a column instead of an RPC because a contract is edited
--     row-by-row by its owner.
--   * A contract's *state* is never stored beyond the owner's intent (`DRAFT`, `ACTIVE`, `TERMINATED`).
--     `EXPIRING` / `EXPIRED` are derived from `end_date` and `reminder_days` at read time, exactly like
--     SCRUM-75 infers a missing check-out: no cron job exists in this project, so a stored verdict would
--     be wrong every morning it was not refreshed.
--   * The Gmail correspondence (C3) is a LOG, not an integration: the app has no OAuth token and never
--     reads a mailbox. Each row records what was exchanged and where the thread lives, and the screen
--     opens Gmail with a prefilled compose/search URL.
--
-- `plan_code` deliberately carries no CHECK tied to a TypeScript list beyond the three sold packages: the
-- vocabulary lives in `lib/domain/contractPlans.ts`, and a code the app does not know must render rather
-- than make a write raise (the SCRUM-62 lesson). The CHECK here lists the three packages the landing site
-- sells (`landing_website/components/pricing/data.ts`); adding a fourth is a new script.

-- ── 0. Preconditions ─────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.organizations') is null or to_regclass('public.users') is null then
    raise exception 'SCRUM-101: run SCRUM-51_organizations.sql first (organizations, users).';
  end if;

  if to_regprocedure('public.current_organization_id()') is null
    or to_regprocedure('public.is_organization_owner()') is null then
    raise exception 'SCRUM-101: run SCRUM-53_tenant_scope.sql and SCRUM-59_role_model.sql first.';
  end if;
end $$;

-- ── 1. Tables ────────────────────────────────────────────────────────────────────────────
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id()
    references public.organizations (id) on delete cascade,
  company_name text not null,
  app_name text not null,
  contact_name text,
  contact_email text not null,
  contact_phone text,
  address text,
  tax_code text,
  status text not null default 'PROSPECT',
  notes text,
  created_by uuid references public.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_company_name_check
    check (char_length(btrim(company_name)) between 2 and 160),
  constraint customers_app_name_check
    check (char_length(btrim(app_name)) between 1 and 80),
  constraint customers_contact_email_check
    check (contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint customers_contact_name_check
    check (contact_name is null or char_length(contact_name) <= 120),
  constraint customers_contact_phone_check
    check (contact_phone is null or char_length(contact_phone) <= 40),
  constraint customers_address_check
    check (address is null or char_length(address) <= 300),
  constraint customers_tax_code_check
    check (tax_code is null or char_length(tax_code) <= 40),
  constraint customers_status_check
    check (status in ('PROSPECT', 'ACTIVE', 'SUSPENDED', 'CHURNED')),
  constraint customers_notes_check
    check (notes is null or char_length(notes) <= 1000)
);

-- One row per company and one per contact address inside an organization. A churned customer is excluded
-- from the e-mail key so the same person can come back under the same address later; the company key keeps
-- every row so two spellings of one name are caught while the row still exists.
create unique index if not exists customers_org_company_key
  on public.customers (organization_id, lower(company_name));

create unique index if not exists customers_org_email_key
  on public.customers (organization_id, lower(contact_email))
  where status <> 'CHURNED';

create index if not exists customers_org_status_idx
  on public.customers (organization_id, status, company_name);

create table if not exists public.customer_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id()
    references public.organizations (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete restrict,
  contract_no text not null,
  plan_code text not null,
  employee_count integer not null,
  unit_price numeric(14, 2) not null,
  -- Generated, never posted: the fee is `price × headcount`, floored at the quotation's minimum. Keeping
  -- it a column (and not a CHECK over three values) is why the API sends only the two parts.
  monthly_fee numeric(14, 2) generated always as
    (greatest(round(unit_price * employee_count, 0), 400000::numeric)) stored,
  billing_cycle text not null default 'MONTHLY',
  start_date date not null,
  end_date date not null,
  auto_renew boolean not null default true,
  reminder_days integer not null default 30,
  status text not null default 'DRAFT',
  terminated_on date,
  termination_reason text,
  renews_contract_id uuid references public.customer_contracts (id) on delete set null,
  note text,
  created_by uuid references public.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_contracts_no_check
    check (char_length(btrim(contract_no)) between 2 and 60),
  constraint customer_contracts_plan_check
    check (plan_code in ('BASIC', 'ADVANCED', 'PREMIUM')),
  constraint customer_contracts_headcount_check
    check (employee_count between 1 and 100000),
  constraint customer_contracts_price_check
    check (unit_price >= 0 and unit_price <= 10000000),
  constraint customer_contracts_cycle_check
    check (billing_cycle in ('MONTHLY', 'QUARTERLY', 'YEARLY')),
  constraint customer_contracts_dates_check
    check (end_date >= start_date),
  constraint customer_contracts_reminder_check
    check (reminder_days between 0 and 365),
  constraint customer_contracts_status_check
    check (status in ('DRAFT', 'ACTIVE', 'TERMINATED')),
  -- A termination carries the day and the reason, the same shape `payslips` gives a void.
  constraint customer_contracts_termination_check
    check (
      status <> 'TERMINATED'
      or (terminated_on is not null and char_length(btrim(coalesce(termination_reason, ''))) >= 5)
    ),
  constraint customer_contracts_note_check
    check (note is null or char_length(note) <= 1000)
);

create unique index if not exists customer_contracts_org_no_key
  on public.customer_contracts (organization_id, contract_no);

create index if not exists customer_contracts_org_end_idx
  on public.customer_contracts (organization_id, end_date);

create index if not exists customer_contracts_customer_idx
  on public.customer_contracts (organization_id, customer_id, start_date desc);

create index if not exists customer_contracts_org_status_idx
  on public.customer_contracts (organization_id, status);

create table if not exists public.customer_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id()
    references public.organizations (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  contract_id uuid references public.customer_contracts (id) on delete set null,
  direction text not null,
  subject text not null,
  counterpart_email text not null,
  counterpart_name text,
  gmail_thread_id text,
  gmail_message_id text,
  gmail_thread_url text,
  sent_at timestamptz not null,
  snippet text,
  body text,
  logged_by uuid references public.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  constraint customer_emails_direction_check
    check (direction in ('INBOUND', 'OUTBOUND', 'NOTE')),
  constraint customer_emails_subject_check
    check (char_length(btrim(subject)) between 1 and 200),
  constraint customer_emails_counterpart_check
    check (counterpart_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint customer_emails_names_check
    check (counterpart_name is null or char_length(counterpart_name) <= 120),
  constraint customer_emails_ids_check
    check (
      (gmail_thread_id is null or char_length(gmail_thread_id) <= 200)
      and (gmail_message_id is null or char_length(gmail_message_id) <= 200)
    ),
  -- Only a Gmail thread link is accepted. The API refuses anything else before the insert, but the column
  -- repeats it because a link is rendered straight into an anchor: `javascript:` in that href is XSS.
  constraint customer_emails_thread_url_check
    check (gmail_thread_url is null or gmail_thread_url like 'https://mail.google.com/%'),
  constraint customer_emails_text_check
    check (
      (snippet is null or char_length(snippet) <= 500)
      and (body is null or char_length(body) <= 8000)
    )
);

-- Pasting the same message twice is a mistake, not a second conversation.
create unique index if not exists customer_emails_org_message_key
  on public.customer_emails (organization_id, gmail_message_id)
  where gmail_message_id is not null;

create index if not exists customer_emails_customer_idx
  on public.customer_emails (organization_id, customer_id, sent_at desc);

create index if not exists customer_emails_contract_idx
  on public.customer_emails (organization_id, contract_id, sent_at desc);

-- Yêu cầu demo / dùng thử (C3). This is a queue, not a customer: a person who filled the landing form is
-- interested, not paying. Turning one into a customer is a separate decision (`converted_customer_id` records
-- which customer it became), which is why the two tables are not merged and why nothing here is invoiced.
create table if not exists public.customer_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id()
    references public.organizations (id) on delete cascade,
  company_name text not null,
  contact_name text,
  contact_email text not null,
  contact_phone text,
  employee_count integer,
  plan_interest text,
  message text,
  source text not null default 'LANDING',
  status text not null default 'NEW',
  received_at timestamptz not null default now(),
  converted_customer_id uuid references public.customers (id) on delete set null,
  note text,
  created_by uuid references public.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_leads_company_check
    check (char_length(btrim(company_name)) between 2 and 160),
  constraint customer_leads_email_check
    check (contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint customer_leads_headcount_check
    check (employee_count is null or employee_count between 1 and 100000),
  constraint customer_leads_status_check
    check (status in ('NEW', 'CONTACTED', 'DEMO_SCHEDULED', 'CONVERTED', 'REJECTED')),
  constraint customer_leads_message_check
    check (message is null or char_length(message) <= 2000),
  constraint customer_leads_note_check
    check (note is null or char_length(note) <= 1000)
);

create index if not exists customer_leads_org_status_idx
  on public.customer_leads (organization_id, status, received_at desc);


-- ── 2. updated_at + delete guards ────────────────────────────────────────────────────────
create or replace function public.crm_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at
  before update on public.customers
  for each row execute function public.crm_touch_updated_at();

drop trigger if exists trg_customer_contracts_updated_at on public.customer_contracts;
create trigger trg_customer_contracts_updated_at
  before update on public.customer_contracts
  for each row execute function public.crm_touch_updated_at();

drop trigger if exists trg_customer_leads_updated_at on public.customer_leads;
create trigger trg_customer_leads_updated_at
  before update on public.customer_leads
  for each row execute function public.crm_touch_updated_at();

-- A customer with a contract is a financial history, so the row is churned (`status = 'CHURNED'`) rather
-- than deleted. The foreign key already refuses the delete; this trigger replaces Postgres' own sentence
-- with a token the API turns into a `409` that names the reason.
create or replace function public.customers_guard_delete()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.customer_contracts c where c.customer_id = old.id
  ) then
    raise exception 'CUSTOMER_HAS_DATA' using errcode = '23503';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_customers_guard_delete on public.customers;
create trigger trg_customers_guard_delete
  before delete on public.customers
  for each row execute function public.customers_guard_delete();

-- A contract that already has correspondence is evidence; "Chấm dứt" is the way to close it. SCRUM-102
-- re-creates this function to add the service/visit/reminder checks once those tables exist.
create or replace function public.customer_contracts_guard_delete()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.customer_emails e where e.contract_id = old.id
  ) then
    raise exception 'CONTRACT_HAS_DATA' using errcode = '23503';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_customer_contracts_guard_delete on public.customer_contracts;
create trigger trg_customer_contracts_guard_delete
  before delete on public.customer_contracts
  for each row execute function public.customer_contracts_guard_delete();

-- ── 3. Privileges and RLS ───────────────────────────────────────────────────────────────
-- The owner's CRM: customer names, contact details and contract money are commercial data, so the policy
-- is `is_organization_owner()` and there is no manager branch. RLS is what actually decides; the route's
-- `customer:manage` capability answers 403 first so the screen reads a sentence, not an empty table.
revoke all on table public.customers from public, anon, authenticated;
revoke all on table public.customer_contracts from public, anon, authenticated;
revoke all on table public.customer_emails from public, anon, authenticated;
revoke all on table public.customer_leads from public, anon, authenticated;

grant select, insert, update, delete on table public.customers to authenticated;
grant select, insert, update, delete on table public.customer_contracts to authenticated;
grant select, insert, delete on table public.customer_emails to authenticated;
grant select, insert, update, delete on table public.customer_leads to authenticated;

alter table public.customers enable row level security;
alter table public.customer_contracts enable row level security;
alter table public.customer_emails enable row level security;
alter table public.customer_leads enable row level security;

drop policy if exists customers_owner_all on public.customers;
create policy customers_owner_all on public.customers
  for all to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  )
  with check (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  );

drop policy if exists customer_contracts_owner_all on public.customer_contracts;
create policy customer_contracts_owner_all on public.customer_contracts
  for all to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  )
  with check (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  );

-- The log is append-and-remove only: correcting a subject means deleting the wrong row and logging it again,
-- which keeps the correspondence trail honest (there is deliberately no UPDATE policy).
drop policy if exists customer_emails_owner_read on public.customer_emails;
create policy customer_emails_owner_read on public.customer_emails
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  );

drop policy if exists customer_emails_owner_insert on public.customer_emails;
create policy customer_emails_owner_insert on public.customer_emails
  for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  );

drop policy if exists customer_emails_owner_delete on public.customer_emails;
create policy customer_emails_owner_delete on public.customer_emails
  for delete to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  );

drop policy if exists customer_leads_owner_all on public.customer_leads;
create policy customer_leads_owner_all on public.customer_leads
  for all to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  )
  with check (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  );

-- ── 4. Read RPCs (security invoker: RLS still decides the rows) ─────────────────────────
-- `today` is a business day in Asia/Bangkok. `current_date` on a Supabase database is UTC, which would
-- make a contract end a day early or late depending on the hour — the same reason `get_revenue_report`
-- computes its own default.
create or replace function public.get_contract_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with today as (
    select (now() at time zone 'Asia/Bangkok')::date as d
  )
  select jsonb_build_object(
    'customers_total', (select count(*) from public.customers),
    'customers_active', (select count(*) from public.customers where status = 'ACTIVE'),
    'contracts_active', (
      select count(*) from public.customer_contracts c, today t
      where c.status = 'ACTIVE' and c.end_date >= t.d
    ),
    'contracts_expiring', (
      select count(*) from public.customer_contracts c, today t
      where c.status = 'ACTIVE'
        and c.end_date >= t.d
        and c.end_date <= t.d + c.reminder_days
    ),
    'contracts_expired', (
      select count(*) from public.customer_contracts c, today t
      where c.status = 'ACTIVE' and c.end_date < t.d
    ),
    'mrr', (
      select coalesce(sum(c.monthly_fee), 0) from public.customer_contracts c, today t
      where c.status = 'ACTIVE' and c.end_date >= t.d
    ),
    'renewals_due_30', (
      select count(*) from public.customer_contracts c, today t
      where c.status = 'ACTIVE' and c.end_date >= t.d and c.end_date <= t.d + 30
    )
  );
$$;

create or replace function public.get_contract_overview(
  p_status text default null,
  p_customer_id uuid default null,
  p_search text default null
)
returns table (
  id uuid,
  organization_id uuid,
  customer_id uuid,
  customer_name text,
  app_name text,
  contact_email text,
  contract_no text,
  plan_code text,
  employee_count integer,
  unit_price numeric,
  monthly_fee numeric,
  billing_cycle text,
  start_date date,
  end_date date,
  auto_renew boolean,
  reminder_days integer,
  status text,
  terminated_on date,
  termination_reason text,
  renews_contract_id uuid,
  note text,
  created_at timestamptz,
  updated_at timestamptz,
  days_to_end integer,
  effective_status text,
  cycle_months integer,
  period_amount numeric,
  last_reminder_at timestamptz,
  email_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with today as (
    select (now() at time zone 'Asia/Bangkok')::date as d
  )
  select v.*
  from (
    select
      c.id,
      c.organization_id,
      c.customer_id,
      cu.company_name as customer_name,
      cu.app_name,
      cu.contact_email,
      c.contract_no,
      c.plan_code,
      c.employee_count,
      c.unit_price,
      c.monthly_fee,
      c.billing_cycle,
      c.start_date,
      c.end_date,
      c.auto_renew,
      c.reminder_days,
      c.status,
      c.terminated_on,
      c.termination_reason,
      c.renews_contract_id,
      c.note,
      c.created_at,
      c.updated_at,
      (c.end_date - t.d)::int as days_to_end,
      case
        when c.status = 'TERMINATED' then 'TERMINATED'
        when c.status = 'DRAFT' then 'DRAFT'
        when c.end_date < t.d then 'EXPIRED'
        when c.end_date <= t.d + c.reminder_days then 'EXPIRING'
        else 'ACTIVE'
      end as effective_status,
      case c.billing_cycle
        when 'YEARLY' then 12
        when 'QUARTERLY' then 3
        else 1
      end as cycle_months,
      c.monthly_fee * case c.billing_cycle
        when 'YEARLY' then 12
        when 'QUARTERLY' then 3
        else 1
      end as period_amount,
      (
        select max(e.sent_at) from public.customer_emails e where e.contract_id = c.id
      ) as last_reminder_at,
      (
        select count(*) from public.customer_emails e where e.contract_id = c.id
      )::int as email_count
    from public.customer_contracts c
    join public.customers cu on cu.id = c.customer_id
    cross join today t
  ) v
  where (p_status is null or v.effective_status = p_status)
    and (p_customer_id is null or v.customer_id = p_customer_id)
    and (
      p_search is null or btrim(p_search) = ''
      or v.customer_name ilike '%' || btrim(p_search) || '%'
      or v.app_name ilike '%' || btrim(p_search) || '%'
      or v.contract_no ilike '%' || btrim(p_search) || '%'
    )
  order by v.end_date asc, v.contract_no asc;
$$;

create or replace function public.get_customer_overview(
  p_status text default null,
  p_search text default null
)
returns table (
  id uuid,
  organization_id uuid,
  company_name text,
  app_name text,
  contact_name text,
  contact_email text,
  contact_phone text,
  address text,
  tax_code text,
  status text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  active_contracts integer,
  monthly_total numeric,
  next_end_date date
)
language sql
stable
security invoker
set search_path = public
as $$
  with today as (
    select (now() at time zone 'Asia/Bangkok')::date as d
  )
  select
    cu.id,
    cu.organization_id,
    cu.company_name,
    cu.app_name,
    cu.contact_name,
    cu.contact_email,
    cu.contact_phone,
    cu.address,
    cu.tax_code,
    cu.status,
    cu.notes,
    cu.created_at,
    cu.updated_at,
    (
      select count(*) from public.customer_contracts c, today t
      where c.customer_id = cu.id and c.status = 'ACTIVE' and c.end_date >= t.d
    )::int as active_contracts,
    (
      select coalesce(sum(c.monthly_fee), 0) from public.customer_contracts c, today t
      where c.customer_id = cu.id and c.status = 'ACTIVE' and c.end_date >= t.d
    ) as monthly_total,
    (
      select min(c.end_date) from public.customer_contracts c, today t
      where c.customer_id = cu.id and c.status = 'ACTIVE' and c.end_date >= t.d
    ) as next_end_date
  from public.customers cu
  where (p_status is null or cu.status = p_status)
    and (
      p_search is null or btrim(p_search) = ''
      or cu.company_name ilike '%' || btrim(p_search) || '%'
      or cu.app_name ilike '%' || btrim(p_search) || '%'
      or cu.contact_email ilike '%' || btrim(p_search) || '%'
    )
  order by cu.company_name asc;
$$;

-- ── 5. Function privileges ──────────────────────────────────────────────────────────────
-- The read functions are invoker functions reading owner-only policies, so granting EXECUTE to
-- `authenticated` cannot widen what they return. They are still revoked from `anon`/`public`.
revoke all on function public.get_contract_summary() from public, anon;
revoke all on function public.get_contract_overview(text, uuid, text) from public, anon;
revoke all on function public.get_customer_overview(text, text) from public, anon;
grant execute on function public.get_contract_summary() to authenticated;
grant execute on function public.get_contract_overview(text, uuid, text) to authenticated;
grant execute on function public.get_customer_overview(text, text) to authenticated;

-- ── 6. Verification ─────────────────────────────────────────────────────────────────────
-- Expect: 4 tables, 6 policies, 3 read functions, and a summary object. Run the second query signed in as a
-- manager if you want to prove that RLS answers zero rows for a role without `customer:manage`.
select
  (select count(*) from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'customers', 'customer_contracts', 'customer_emails', 'customer_leads'
      )) as tables_created,
  (select count(*) from pg_policies
    where schemaname = 'public'
      and tablename in (
        'customers', 'customer_contracts', 'customer_emails', 'customer_leads'
      )) as policies_created,
  (select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('get_contract_summary', 'get_contract_overview', 'get_customer_overview'))
    as read_functions,
  (select public.get_contract_summary()) as summary_probe;




