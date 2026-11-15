-- SCRUM-102: Bảo hành, bảo trì định kỳ và nhật ký nhắc khách (C5).
-- Run AFTER SCRUM-101_customers_contracts.sql (this script re-creates one guard from it and reads
-- `customers` / `customer_contracts`). Idempotent: safe to re-run.
--
-- The three tables answer the three questions the ticket asks:
--
--   * `customer_services` — what was sold, and until when it is under warranty. `warranty_end_on` is a
--     generated column, so the end date cannot disagree with the start date and the warranty length.
--   * `customer_maintenance_visits` — a planned or completed maintenance/repair. Its state is derived
--     (`PLANNED` / `OVERDUE` / `DONE`) from `completed_on` and `scheduled_on`, never stored: a stored
--     "overdue" would be wrong every morning nobody refreshed it.
--   * `customer_reminder_logs` — *what was actually sent*. The list of things that need a reminder is
--     derived at read time from the contracts' end dates and the services' next-due dates, so this table
--     is a trail, not a queue: a reminder that was never sent is simply a row that does not exist yet.
--
-- No cron job and no notification type is added here. A date crossing a threshold is not an event the
-- database can hear, so the screen owns the "việc cần làm" list and the owner sends the mail from Gmail.

-- ── 0. Preconditions ─────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.customers') is null or to_regclass('public.customer_contracts') is null then
    raise exception 'SCRUM-102: run SCRUM-101_customers_contracts.sql first.';
  end if;

  if to_regprocedure('public.crm_touch_updated_at()') is null then
    raise exception 'SCRUM-102: SCRUM-101 is only half applied (crm_touch_updated_at is missing).';
  end if;
end $$;

-- ── 1. Tables ────────────────────────────────────────────────────────────────────────────
create table if not exists public.customer_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id()
    references public.organizations (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  contract_id uuid references public.customer_contracts (id) on delete set null,
  service_name text not null,
  serial_no text,
  warranty_start_on date not null,
  warranty_months integer not null default 12,
  -- Computed by the trigger below, never posted: `start + months` is the warranty the customer bought, and
  -- the API has no field for the end date. A trigger (rather than a generated column) keeps the arithmetic
  -- independent of any expression-volatility rule and still overwrites anything a caller might send.
  warranty_end_on date not null,
  maintenance_interval_months integer not null default 6,
  status text not null default 'ACTIVE',
  note text,
  created_by uuid references public.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_services_name_check
    check (char_length(btrim(service_name)) between 2 and 120),
  constraint customer_services_serial_check
    check (serial_no is null or char_length(serial_no) <= 80),
  constraint customer_services_warranty_check
    check (warranty_months between 0 and 120),
  constraint customer_services_interval_check
    check (maintenance_interval_months between 0 and 60),
  constraint customer_services_status_check
    check (status in ('ACTIVE', 'ENDED')),
  constraint customer_services_note_check
    check (note is null or char_length(note) <= 1000)
);

create index if not exists customer_services_customer_idx
  on public.customer_services (organization_id, customer_id, status);

create index if not exists customer_services_warranty_idx
  on public.customer_services (organization_id, warranty_end_on);

create table if not exists public.customer_maintenance_visits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id()
    references public.organizations (id) on delete cascade,
  service_id uuid not null references public.customer_services (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  scheduled_on date not null,
  completed_on date,
  kind text not null default 'MAINTENANCE',
  technician text,
  cost numeric(14, 2) not null default 0,
  summary text,
  created_by uuid references public.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_maintenance_visits_kind_check
    check (kind in ('MAINTENANCE', 'REPAIR', 'SUPPORT', 'TRAINING')),
  constraint customer_maintenance_visits_cost_check
    check (cost >= 0 and cost <= 1000000000),
  constraint customer_maintenance_visits_summary_check
    check (summary is null or char_length(summary) <= 1000),
  -- A finished visit must say what was done: the row is the customer's service history, and "xong" with no
  -- sentence is indistinguishable from a mistyped date.
  constraint customer_maintenance_visits_done_check
    check (
      completed_on is null
      or char_length(btrim(coalesce(summary, ''))) >= 3
    )
);

create index if not exists customer_maintenance_visits_service_idx
  on public.customer_maintenance_visits (organization_id, service_id, scheduled_on desc);

create index if not exists customer_maintenance_visits_open_idx
  on public.customer_maintenance_visits (organization_id, scheduled_on)
  where completed_on is null;

create table if not exists public.customer_reminder_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id()
    references public.organizations (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  contract_id uuid references public.customer_contracts (id) on delete set null,
  service_id uuid references public.customer_services (id) on delete set null,
  kind text not null,
  due_on date not null,
  channel text not null default 'EMAIL',
  subject text,
  body text,
  sent_at timestamptz not null default now(),
  sent_by uuid references public.users (id) default auth.uid(),
  note text,
  constraint customer_reminder_logs_kind_check
    check (kind in ('RENEWAL', 'EXPIRY', 'MAINTENANCE', 'USAGE', 'OTHER')),
  constraint customer_reminder_logs_channel_check
    check (channel in ('EMAIL', 'PHONE', 'MEETING', 'IN_PERSON')),
  constraint customer_reminder_logs_text_check
    check (
      (subject is null or char_length(subject) <= 200)
      and (body is null or char_length(body) <= 8000)
      and (note is null or char_length(note) <= 500)
    )
);

-- One log per item per day: the "đã gửi" button is clicked once, and the guard makes a double click a
-- `409` instead of a duplicate trail entry. `due_on` is part of the key on purpose — next month's reminder
-- for the same customer and kind is a different reminder.
--
-- The day is spelled `sent_at at time zone 'Asia/Bangkok'`, not `sent_at::date`: a bare cast is STABLE
-- (it depends on the session's TimeZone) and PostgreSQL refuses a stable expression in an index.
create unique index if not exists customer_reminder_logs_once_per_day
  on public.customer_reminder_logs (
    organization_id,
    customer_id,
    kind,
    due_on,
    coalesce(contract_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(service_id, '00000000-0000-0000-0000-000000000000'::uuid),
    ((sent_at at time zone 'Asia/Bangkok')::date)
  );

create index if not exists customer_reminder_logs_customer_idx
  on public.customer_reminder_logs (organization_id, customer_id, sent_at desc);

-- ── 2. updated_at + the warranty end ────────────────────────────────────────────────────
-- The end of a warranty is `start + months`, in one place. A client cannot move it independently of the two
-- numbers it comes from, and the read RPC (`get_maintenance_overview`) uses the stored value.
create or replace function public.customer_services_set_warranty_end()
returns trigger
language plpgsql
as $$
begin
  new.warranty_end_on :=
    (new.warranty_start_on + make_interval(months => new.warranty_months))::date;
  return new;
end;
$$;

drop trigger if exists trg_customer_services_warranty_end on public.customer_services;
create trigger trg_customer_services_warranty_end
  before insert or update on public.customer_services
  for each row execute function public.customer_services_set_warranty_end();

drop trigger if exists trg_customer_services_updated_at on public.customer_services;
create trigger trg_customer_services_updated_at
  before update on public.customer_services
  for each row execute function public.crm_touch_updated_at();

drop trigger if exists trg_customer_maintenance_visits_updated_at
  on public.customer_maintenance_visits;
create trigger trg_customer_maintenance_visits_updated_at
  before update on public.customer_maintenance_visits
  for each row execute function public.crm_touch_updated_at();

-- SCRUM-101 refused to delete a contract that still has email correspondence. The same rule now covers the
-- service history and the reminder trail: a contract with any of the three is closed with "Chấm dứt", never
-- deleted, so the money that was invoiced keeps its evidence.
create or replace function public.customer_contracts_guard_delete()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.customer_emails e where e.contract_id = old.id
  ) or exists (
    select 1 from public.customer_services s where s.contract_id = old.id
  ) or exists (
    select 1 from public.customer_reminder_logs r where r.contract_id = old.id
  ) then
    raise exception 'CONTRACT_HAS_DATA' using errcode = '23503';
  end if;

  return old;
end;
$$;

-- ── 3. Privileges and RLS ───────────────────────────────────────────────────────────────
revoke all on table public.customer_services from public, anon, authenticated;
revoke all on table public.customer_maintenance_visits from public, anon, authenticated;
revoke all on table public.customer_reminder_logs from public, anon, authenticated;

grant select, insert, update, delete on table public.customer_services to authenticated;
grant select, insert, update, delete on table public.customer_maintenance_visits to authenticated;
-- The reminder trail is append-only: a wrong entry is not editable (and not deletable) because the point of
-- the log is "what the customer was actually told".
grant select, insert on table public.customer_reminder_logs to authenticated;

alter table public.customer_services enable row level security;
alter table public.customer_maintenance_visits enable row level security;
alter table public.customer_reminder_logs enable row level security;

drop policy if exists customer_services_owner_all on public.customer_services;
create policy customer_services_owner_all on public.customer_services
  for all to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  )
  with check (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  );

drop policy if exists customer_maintenance_visits_owner_all
  on public.customer_maintenance_visits;
create policy customer_maintenance_visits_owner_all
  on public.customer_maintenance_visits
  for all to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  )
  with check (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  );

drop policy if exists customer_reminder_logs_owner_read
  on public.customer_reminder_logs;
create policy customer_reminder_logs_owner_read
  on public.customer_reminder_logs
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  );

drop policy if exists customer_reminder_logs_owner_insert
  on public.customer_reminder_logs;
create policy customer_reminder_logs_owner_insert
  on public.customer_reminder_logs
  for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  );

-- ── 4. Read RPCs (security invoker: RLS still decides the rows) ─────────────────────────
-- The next due date is "the day the last completed visit happened, plus the interval", and a service that
-- has never been visited counts from the day its warranty started. Doing this in one place means the
-- summary card, the table chip and the reminder queue cannot disagree about the same service.
create or replace function public.get_maintenance_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with today as (
    select (now() at time zone 'Asia/Bangkok')::date as d
  ),
  due as (
    select
      s.status,
      s.warranty_months,
      s.warranty_end_on,
      s.maintenance_interval_months,
      case
        when s.maintenance_interval_months = 0 then null
        else (
          coalesce(
            (select max(v.completed_on) from public.customer_maintenance_visits v
              where v.service_id = s.id and v.completed_on is not null),
            s.warranty_start_on
          ) + make_interval(months => s.maintenance_interval_months)
        )::date
      end as next_due_on
    from public.customer_services s
  )
  select jsonb_build_object(
    'services_total', (select count(*) from due),
    'services_active', (select count(*) from due where status = 'ACTIVE'),
    'in_warranty', (
      select count(*) from due, today t
      where warranty_months > 0 and warranty_end_on >= t.d
    ),
    'warranty_expired', (
      select count(*) from due, today t
      where warranty_months > 0 and warranty_end_on < t.d
    ),
    'due_soon', (
      select count(*) from due, today t
      where status = 'ACTIVE' and next_due_on is not null
        and next_due_on >= t.d and next_due_on <= t.d + 14
    ),
    'overdue', (
      select count(*) from due, today t
      where status = 'ACTIVE' and next_due_on is not null and next_due_on < t.d
    ),
    'planned_visits', (
      select count(*) from public.customer_maintenance_visits v, today t
      where v.completed_on is null and v.scheduled_on >= t.d
    ),
    'overdue_visits', (
      select count(*) from public.customer_maintenance_visits v, today t
      where v.completed_on is null and v.scheduled_on < t.d
    )
  );
$$;

create or replace function public.get_maintenance_overview(
  p_state text default null,
  p_customer_id uuid default null
)
returns table (
  id uuid,
  organization_id uuid,
  customer_id uuid,
  customer_name text,
  app_name text,
  contact_email text,
  contract_id uuid,
  contract_no text,
  service_name text,
  serial_no text,
  warranty_start_on date,
  warranty_end_on date,
  warranty_months integer,
  maintenance_interval_months integer,
  status text,
  note text,
  created_at timestamptz,
  updated_at timestamptz,
  last_completed_on date,
  next_due_on date,
  next_planned_on date,
  warranty_state text,
  maintenance_state text
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
    u.id, u.organization_id, u.customer_id, u.customer_name, u.app_name, u.contact_email,
    u.contract_id, u.contract_no, u.service_name, u.serial_no,
    u.warranty_start_on, u.warranty_end_on, u.warranty_months,
    u.maintenance_interval_months, u.status, u.note, u.created_at, u.updated_at,
    u.last_completed_on, u.next_due_on, u.next_planned_on, u.warranty_state,
    case
      when u.status = 'ENDED' or u.maintenance_interval_months = 0 then 'NONE'
      when u.next_due_on < t.d then 'OVERDUE'
      when u.next_due_on <= t.d + 14 then 'DUE_SOON'
      else 'OK'
    end as maintenance_state
  from (
    select
      s.id, s.organization_id, s.customer_id,
      cu.company_name as customer_name, cu.app_name, cu.contact_email,
      s.contract_id, c.contract_no, s.service_name, s.serial_no,
      s.warranty_start_on, s.warranty_end_on, s.warranty_months,
      s.maintenance_interval_months, s.status, s.note, s.created_at, s.updated_at,
      (
        select max(v.completed_on) from public.customer_maintenance_visits v
        where v.service_id = s.id and v.completed_on is not null
      ) as last_completed_on,
      case
        when s.maintenance_interval_months = 0 then null
        else (
          coalesce(
            (select max(v.completed_on) from public.customer_maintenance_visits v
              where v.service_id = s.id and v.completed_on is not null),
            s.warranty_start_on
          ) + make_interval(months => s.maintenance_interval_months)
        )::date
      end as next_due_on,
      (
        select min(v.scheduled_on) from public.customer_maintenance_visits v, today t
        where v.service_id = s.id and v.completed_on is null and v.scheduled_on >= t.d
      ) as next_planned_on,
      case
        when s.warranty_months = 0 then 'NONE'
        when s.warranty_end_on < t.d then 'EXPIRED'
        when s.warranty_end_on <= t.d + 30 then 'EXPIRING'
        else 'IN_WARRANTY'
      end as warranty_state
    from public.customer_services s
    join public.customers cu on cu.id = s.customer_id
    left join public.customer_contracts c on c.id = s.contract_id
    cross join today t
  ) u
  cross join today t
  where (p_customer_id is null or u.customer_id = p_customer_id)
    and (
      p_state is null
      or (p_state = 'NONE' and (u.status = 'ENDED' or u.maintenance_interval_months = 0))
      or (p_state = 'OVERDUE' and u.status = 'ACTIVE' and u.maintenance_interval_months > 0
          and u.next_due_on < t.d)
      or (p_state = 'DUE_SOON' and u.status = 'ACTIVE' and u.maintenance_interval_months > 0
          and u.next_due_on >= t.d and u.next_due_on <= t.d + 14)
      or (p_state = 'OK' and u.status = 'ACTIVE' and u.maintenance_interval_months > 0
          and u.next_due_on > t.d + 14)
    )
  order by u.next_due_on nulls last, u.service_name;
$$;

-- ── 5. Function privileges ──────────────────────────────────────────────────────────────
revoke all on function public.get_maintenance_summary() from public, anon;
revoke all on function public.get_maintenance_overview(text, uuid) from public, anon;
grant execute on function public.get_maintenance_summary() to authenticated;
grant execute on function public.get_maintenance_overview(text, uuid) to authenticated;

-- ── 6. Verification ─────────────────────────────────────────────────────────────────────
-- Expect: 3 tables, 4 policies, 2 read functions, and a summary object whose counters are 0 on a fresh
-- database. The second query is the "the chip and the queue agree" probe: it lists the next due date of
-- every service exactly as the API will read it.
select
  (select count(*) from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'customer_services',
        'customer_maintenance_visits',
        'customer_reminder_logs'
      )) as tables_created,
  (select count(*) from pg_policies
    where schemaname = 'public'
      and tablename in (
        'customer_services',
        'customer_maintenance_visits',
        'customer_reminder_logs'
      )) as policies_created,
  (select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('get_maintenance_summary', 'get_maintenance_overview'))
    as read_functions,
  (select public.get_maintenance_summary()) as summary_probe;

select
  o.service_name,
  o.warranty_end_on,
  o.warranty_state,
  o.last_completed_on,
  o.next_due_on,
  o.maintenance_state
from public.get_maintenance_overview(null, null) o
order by o.service_name;





