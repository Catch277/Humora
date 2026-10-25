-- SCRUM-90: Lương (payroll) — mức lương, phiếu lương, chi tiết ca và nhật ký thao tác.
-- Run this script in Supabase Dashboard > SQL Editor, AFTER SCRUM-21, SCRUM-30, SCRUM-51, SCRUM-59 and
-- SCRUM-69 (it reads `attendance.worked_seconds`) and, optionally, SCRUM-70 (for the notification).
--
-- Why this is built the way it is — money is the most sensitive thing in the app:
--
--   * Nobody writes to the payroll tables directly. Every table below has RLS enabled, only a SELECT
--     policy, and the API roles (`anon`, `authenticated`) have INSERT/UPDATE/DELETE *revoked*. All changes go
--     through `security definer` functions that re-check who the caller is. A client that could write
--     `net_amount` directly would be a client that can pay itself.
--   * An employee can read only their OWN payslip, and only once it is PUBLISHED. A DRAFT is invisible to
--     them. The OWNER of the organization reads every payslip of that organization; a MANAGER and an
--     EMPLOYEE never read anyone else's pay (least privilege — widen on purpose, not by accident).
--   * Money is `bigint` VND (no decimals in a đồng), never a float. The amounts of a payslip are SNAPSHOTS:
--     once published, a payslip and its lines cannot change (trigger-enforced, also against the SQL editor).
--     A correction is "huỷ" (VOID) + generate again, which leaves an audit trail.
--   * Hours come from `attendance.worked_seconds` (SCRUM-69 — pauses removed), capped at the length of the
--     scheduled ca, so forgetting to check out or checking in early never pays extra. Late arrival simply
--     pays fewer minutes; there is NO automatic fine (the policy screen promises none, Điều 127 BLLĐ).
--   * Totals are derived from the lines/items by `payroll_recalc`, and a CHECK keeps
--     `gross = work + other earnings` and `net = gross - deductions`.
--
-- Deliberately NOT here (decide with your accountant, add as MANUAL items): BHXH/BHYT/BHTN and thuế TNCN.
-- Applied by hand; idempotent: safe to re-run.

-- ── 0. Preconditions ─────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.users') is null
    or to_regclass('public.organizations') is null
    or to_regclass('public.attendance') is null
    or to_regclass('public.shifts') is null then
    raise exception 'SCRUM-90: run SCRUM-21 / 30 / 51 first (users, organizations, attendance, shifts).';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'attendance' and column_name = 'worked_seconds'
  ) then
    raise exception 'SCRUM-90: run SCRUM-69_attendance_worked_time.sql first (attendance.worked_seconds).';
  end if;

  if to_regprocedure('public.is_organization_owner()') is null
    or to_regprocedure('public.current_organization_id()') is null then
    raise exception 'SCRUM-90: run SCRUM-51 and SCRUM-59 first (is_organization_owner, current_organization_id).';
  end if;
end $$;

-- Optional explicit flag for an overtime ca; the name 'Tăng ca…' also counts (SCRUM-84).
alter table public.shifts add column if not exists is_overtime boolean not null default false;

-- ── 1. Tables ────────────────────────────────────────────────────────────────────────────
-- 1a. Pay profile: the rate an employee is paid from a date on. A new rate = a new row, so history stays.
create table if not exists public.pay_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  employee_id uuid not null references public.users (id) on delete restrict,
  hourly_rate bigint not null,
  overtime_multiplier numeric(3, 2) not null default 1.50,
  fixed_allowance bigint not null default 0,
  effective_from date not null,
  note text,
  created_by uuid references public.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  constraint pay_profiles_rate_check check (hourly_rate >= 0 and hourly_rate <= 10000000),
  constraint pay_profiles_ot_check check (overtime_multiplier >= 1 and overtime_multiplier <= 5),
  constraint pay_profiles_allowance_check check (fixed_allowance >= 0 and fixed_allowance <= 1000000000),
  constraint pay_profiles_employee_from_key unique (employee_id, effective_from)
);

create index if not exists pay_profiles_employee_from_idx
  on public.pay_profiles (employee_id, effective_from desc);

-- 1b. Payslip: one per employee per calendar month (VOID ones do not count).
create table if not exists public.payslips (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  employee_id uuid not null references public.users (id) on delete restrict,
  branch_id uuid references public.branches (id) on delete set null,
  period_start date not null,
  period_end date not null,
  status text not null default 'DRAFT',
  regular_minutes integer not null default 0,
  overtime_minutes integer not null default 0,
  shifts_counted integer not null default 0,
  shifts_skipped integer not null default 0,
  work_amount bigint not null default 0,
  other_earnings bigint not null default 0,
  gross_amount bigint not null default 0,
  deduction_amount bigint not null default 0,
  net_amount bigint not null default 0,
  generated_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references public.users (id),
  acknowledged_at timestamptz,
  dispute_note text,
  disputed_at timestamptz,
  dispute_resolved_at timestamptz,
  void_reason text,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payslips_status_check check (status in ('DRAFT', 'PUBLISHED', 'VOID')),
  constraint payslips_period_check check (
    period_start = date_trunc('month', period_start)::date
    and period_end = (date_trunc('month', period_start) + interval '1 month - 1 day')::date
  ),
  constraint payslips_amounts_check check (
    regular_minutes >= 0 and overtime_minutes >= 0 and shifts_counted >= 0 and shifts_skipped >= 0
    and work_amount >= 0 and other_earnings >= 0 and deduction_amount >= 0
    and gross_amount = work_amount + other_earnings
    and deduction_amount <= gross_amount
    and net_amount = gross_amount - deduction_amount
  ),
  constraint payslips_publish_check check (
    status <> 'PUBLISHED' or (published_at is not null and published_by is not null)
  )
);

create unique index if not exists payslips_employee_period_live_idx
  on public.payslips (employee_id, period_start)
  where status <> 'VOID';
create index if not exists payslips_org_period_idx on public.payslips (organization_id, period_start);
create index if not exists payslips_employee_period_idx on public.payslips (employee_id, period_start desc);

-- 1c. One line per ca that was paid: the evidence an employee can check against their own memory.
create table if not exists public.payslip_work_lines (
  id uuid primary key default gen_random_uuid(),
  payslip_id uuid not null references public.payslips (id) on delete cascade,
  attendance_id uuid,
  work_date date not null,
  shift_name text,
  minutes integer not null,
  is_overtime boolean not null default false,
  hourly_rate bigint not null,
  multiplier numeric(3, 2) not null default 1,
  amount bigint not null,
  constraint payslip_work_lines_check check (minutes > 0 and hourly_rate >= 0 and amount >= 0)
);
create index if not exists payslip_work_lines_payslip_idx on public.payslip_work_lines (payslip_id, work_date);

-- 1d. Everything that is not "hours × rate": phụ cấp, thưởng, điều chỉnh, khấu trừ.
create table if not exists public.payslip_items (
  id uuid primary key default gen_random_uuid(),
  payslip_id uuid not null references public.payslips (id) on delete cascade,
  kind text not null,
  code text not null,
  label text not null,
  amount bigint not null,
  source text not null default 'MANUAL',
  created_by uuid references public.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  constraint payslip_items_kind_check check (kind in ('EARNING', 'DEDUCTION')),
  constraint payslip_items_source_check check (source in ('AUTO', 'MANUAL')),
  constraint payslip_items_amount_check check (amount > 0 and amount <= 1000000000),
  constraint payslip_items_label_check check (char_length(btrim(label)) between 1 and 80),
  constraint payslip_items_code_check check (code ~ '^[A-Z0-9_]{2,30}$')
);
create index if not exists payslip_items_payslip_idx on public.payslip_items (payslip_id);

-- 1e. Who did what to the money.
create table if not exists public.payroll_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  actor_id uuid references public.users (id) default auth.uid(),
  action text not null,
  entity text not null,
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists payroll_audit_log_org_idx on public.payroll_audit_log (organization_id, created_at desc);

-- ── 2. Privileges and RLS: read-only for the API roles ───────────────────────────────────
-- Supabase grants every new table to anon/authenticated by default; take that away explicitly.
revoke all on table public.pay_profiles, public.payslips, public.payslip_work_lines,
  public.payslip_items, public.payroll_audit_log from public, anon, authenticated;
grant select on table public.pay_profiles, public.payslips, public.payslip_work_lines,
  public.payslip_items, public.payroll_audit_log to authenticated;

alter table public.pay_profiles enable row level security;
alter table public.payslips enable row level security;
alter table public.payslip_work_lines enable row level security;
alter table public.payslip_items enable row level security;
alter table public.payroll_audit_log enable row level security;

drop policy if exists pay_profiles_select on public.pay_profiles;
create policy pay_profiles_select on public.pay_profiles
  for select to authenticated
  using (
    employee_id = auth.uid()
    or (organization_id = public.current_organization_id() and public.is_organization_owner())
  );

-- The employee sees only their own PUBLISHED payslip; the owner sees their organization's.
drop policy if exists payslips_select on public.payslips;
create policy payslips_select on public.payslips
  for select to authenticated
  using (
    (employee_id = auth.uid() and status = 'PUBLISHED')
    or (organization_id = public.current_organization_id() and public.is_organization_owner())
  );

-- Child rows are visible exactly when their payslip is (the sub-select runs under the payslips policy).
drop policy if exists payslip_work_lines_select on public.payslip_work_lines;
create policy payslip_work_lines_select on public.payslip_work_lines
  for select to authenticated
  using (exists (select 1 from public.payslips p where p.id = payslip_id));

drop policy if exists payslip_items_select on public.payslip_items;
create policy payslip_items_select on public.payslip_items
  for select to authenticated
  using (exists (select 1 from public.payslips p where p.id = payslip_id));

drop policy if exists payroll_audit_log_select on public.payroll_audit_log;
create policy payroll_audit_log_select on public.payroll_audit_log
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_organization_owner());

-- ── 3. Immutability guards (also hold for the SQL editor) ────────────────────────────────
create or replace function public.payslips_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'DRAFT' then
      raise exception 'PAYSLIP_IMMUTABLE: only a DRAFT payslip can be deleted (void it instead).' using errcode = '42501';
    end if;
    return old;
  end if;

  new.updated_at := now();

  if old.status = 'DRAFT' then
    if new.status not in ('DRAFT', 'PUBLISHED', 'VOID') then
      raise exception 'PAYSLIP_BAD_STATUS' using errcode = '22023';
    end if;
    return new;
  end if;

  -- PUBLISHED or VOID: identity and money are frozen.
  if new.organization_id is distinct from old.organization_id
    or new.employee_id is distinct from old.employee_id
    or new.branch_id is distinct from old.branch_id
    or new.period_start is distinct from old.period_start
    or new.period_end is distinct from old.period_end
    or new.regular_minutes is distinct from old.regular_minutes
    or new.overtime_minutes is distinct from old.overtime_minutes
    or new.shifts_counted is distinct from old.shifts_counted
    or new.shifts_skipped is distinct from old.shifts_skipped
    or new.work_amount is distinct from old.work_amount
    or new.other_earnings is distinct from old.other_earnings
    or new.gross_amount is distinct from old.gross_amount
    or new.deduction_amount is distinct from old.deduction_amount
    or new.net_amount is distinct from old.net_amount
    or new.published_at is distinct from old.published_at
    or new.published_by is distinct from old.published_by then
    raise exception 'PAYSLIP_IMMUTABLE: a published payslip cannot be changed (void it and generate again).' using errcode = '42501';
  end if;

  if old.status = 'VOID' and new.status <> 'VOID' then
    raise exception 'PAYSLIP_IMMUTABLE: a voided payslip stays void.' using errcode = '42501';
  end if;
  if old.status = 'PUBLISHED' and new.status not in ('PUBLISHED', 'VOID') then
    raise exception 'PAYSLIP_BAD_STATUS' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists payslips_guard on public.payslips;
create trigger payslips_guard
  before update or delete on public.payslips
  for each row execute function public.payslips_guard();

create or replace function public.payslip_children_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_payslip uuid := coalesce(new.payslip_id, old.payslip_id);
begin
  select status into v_status from public.payslips where id = v_payslip;
  -- No parent row = the parent is being deleted (cascade of a DRAFT); anything else must be a DRAFT.
  if found and v_status <> 'DRAFT' then
    raise exception 'PAYSLIP_IMMUTABLE: the lines of a published payslip cannot change.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists payslip_work_lines_guard on public.payslip_work_lines;
create trigger payslip_work_lines_guard
  before insert or update or delete on public.payslip_work_lines
  for each row execute function public.payslip_children_guard();

drop trigger if exists payslip_items_guard on public.payslip_items;
create trigger payslip_items_guard
  before insert or update or delete on public.payslip_items
  for each row execute function public.payslip_children_guard();

-- The audit log is append-only.
create or replace function public.payroll_audit_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'PAYROLL_AUDIT_APPEND_ONLY' using errcode = '42501';
end;
$$;

drop trigger if exists payroll_audit_append_only on public.payroll_audit_log;
create trigger payroll_audit_append_only
  before update or delete on public.payroll_audit_log
  for each row execute function public.payroll_audit_append_only();

-- ── 4. Internal helpers (not callable by API roles) ──────────────────────────────────────
-- Returns the caller's organization when (and only when) the caller is its OWNER.
create or replace function public.payroll_require_owner()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if not public.is_organization_owner() then
    raise exception 'PAYROLL_OWNER_ONLY' using errcode = '42501';
  end if;
  v_org := public.current_organization_id();
  if v_org is null then
    raise exception 'PAYROLL_NO_ORGANIZATION' using errcode = '42501';
  end if;
  return v_org;
end;
$$;

create or replace function public.payroll_audit(
  p_org uuid, p_action text, p_entity text, p_entity_id uuid, p_detail jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.payroll_audit_log (organization_id, actor_id, action, entity, entity_id, detail)
  values (p_org, auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_detail, '{}'::jsonb));
$$;

-- The one place hours become money. Used by the draft generator AND by the employee's own estimate, so
-- the number an employee sees mid-month is computed by exactly the rule that will pay them.
--   minutes = floor(min(worked_seconds, length of the scheduled ca) / 60)
--   amount  = round(minutes × rate × (overtime multiplier | 1) / 60)       (numeric arithmetic, rounded once per ca)
-- A ca that is not paid comes back with `counted = false` and a `skip_reason`.
create or replace function public.payroll_work_lines(p_employee_id uuid, p_start date, p_end date)
returns table (
  attendance_id uuid,
  work_date date,
  shift_name text,
  minutes integer,
  is_overtime boolean,
  hourly_rate bigint,
  multiplier numeric,
  amount bigint,
  counted boolean,
  skip_reason text
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      a.id as attendance_id,
      a.work_date,
      s.name as shift_name,
      a.status,
      a.worked_seconds,
      (coalesce(s.is_overtime, false) or s.name like 'Tăng ca%' or s.name like 'tăng ca%') as is_overtime,
      case
        when s.id is null or s.start_time is null or s.end_time is null then null
        else greatest(0, extract(epoch from (
          case when s.end_time >= s.start_time
            then s.end_time - s.start_time
            else s.end_time - s.start_time + interval '24 hours'
          end
        ))::integer)
      end as cap_seconds,
      p.hourly_rate,
      p.overtime_multiplier
    from public.attendance a
    left join public.shifts s on s.id = a.shift_id
    left join lateral (
      select pp.hourly_rate, pp.overtime_multiplier
      from public.pay_profiles pp
      where pp.employee_id = a.employee_id and pp.effective_from <= a.work_date
      order by pp.effective_from desc
      limit 1
    ) p on true
    where a.employee_id = p_employee_id
      and a.work_date between p_start and p_end
      and a.check_in_at is not null
      and a.check_out_at is not null
  ),
  judged as (
    select b.*,
      case
        when b.status = 'ABSENT' then 'ABSENT'
        when b.cap_seconds is null then 'NO_SHIFT'
        when b.hourly_rate is null then 'NO_PAY_PROFILE'
        when least(b.worked_seconds, b.cap_seconds) < 60 then 'NO_TIME'
        else null
      end as skip_reason
    from base b
  )
  select
    j.attendance_id,
    j.work_date,
    j.shift_name,
    case when j.skip_reason is null then least(j.worked_seconds, j.cap_seconds) / 60 else 0 end,
    j.is_overtime,
    coalesce(j.hourly_rate, 0)::bigint,
    case when j.is_overtime then coalesce(j.overtime_multiplier, 1) else 1 end::numeric,
    case when j.skip_reason is null
      then round(
        (least(j.worked_seconds, j.cap_seconds) / 60)::numeric
        * j.hourly_rate
        * (case when j.is_overtime then j.overtime_multiplier else 1 end)
        / 60
      )::bigint
      else 0
    end,
    (j.skip_reason is null),
    j.skip_reason
  from judged j
  order by j.work_date, j.shift_name;
$$;

-- Re-derives the totals of a DRAFT from its lines and items.
create or replace function public.payroll_recalc(p_payslip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regular integer;
  v_overtime integer;
  v_work bigint;
  v_earn bigint;
  v_ded bigint;
begin
  select
    coalesce(sum(minutes) filter (where not is_overtime), 0),
    coalesce(sum(minutes) filter (where is_overtime), 0),
    coalesce(sum(amount), 0)
  into v_regular, v_overtime, v_work
  from public.payslip_work_lines where payslip_id = p_payslip_id;

  select
    coalesce(sum(amount) filter (where kind = 'EARNING'), 0),
    coalesce(sum(amount) filter (where kind = 'DEDUCTION'), 0)
  into v_earn, v_ded
  from public.payslip_items where payslip_id = p_payslip_id;

  if v_ded > v_work + v_earn then
    raise exception 'PAYSLIP_DEDUCTIONS_EXCEED_GROSS' using errcode = '23514';
  end if;

  update public.payslips
  set regular_minutes = v_regular,
      overtime_minutes = v_overtime,
      work_amount = v_work,
      other_earnings = v_earn,
      gross_amount = v_work + v_earn,
      deduction_amount = v_ded,
      net_amount = v_work + v_earn - v_ded
  where id = p_payslip_id;
end;
$$;

-- ── 5. Owner functions ───────────────────────────────────────────────────────────────────
-- Set the rate of an employee of the caller's organization from a date on.
create or replace function public.set_pay_profile(
  p_employee_id uuid,
  p_hourly_rate bigint,
  p_effective_from date,
  p_overtime_multiplier numeric default 1.5,
  p_fixed_allowance bigint default 0,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.payroll_require_owner();
  v_id uuid;
begin
  if not exists (
    select 1 from public.users u
    where u.id = p_employee_id and u.organization_id = v_org and upper(coalesce(u.role, '')) <> 'OWNER'
  ) then
    raise exception 'PAYROLL_EMPLOYEE_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.pay_profiles (
    organization_id, employee_id, hourly_rate, overtime_multiplier, fixed_allowance, effective_from, note
  )
  values (
    v_org, p_employee_id, p_hourly_rate, p_overtime_multiplier, coalesce(p_fixed_allowance, 0),
    p_effective_from, nullif(btrim(p_note), '')
  )
  on conflict (employee_id, effective_from) do update
    set hourly_rate = excluded.hourly_rate,
        overtime_multiplier = excluded.overtime_multiplier,
        fixed_allowance = excluded.fixed_allowance,
        note = excluded.note,
        created_by = auth.uid()
  returning id into v_id;

  perform public.payroll_audit(v_org, 'SET_PAY_PROFILE', 'pay_profile', v_id, jsonb_build_object(
    'employee_id', p_employee_id, 'hourly_rate', p_hourly_rate,
    'overtime_multiplier', p_overtime_multiplier, 'fixed_allowance', coalesce(p_fixed_allowance, 0),
    'effective_from', p_effective_from));
  return v_id;
end;
$$;

-- Create / refresh the DRAFT payslips of one month (for everybody with a rate, or for one employee).
-- A DRAFT is rebuilt from the timesheet; PUBLISHED ones are never touched. Returns how many drafts exist after.
create or replace function public.generate_payslips(p_period_start date, p_employee_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.payroll_require_owner();
  v_start date := date_trunc('month', p_period_start)::date;
  v_end date := (date_trunc('month', p_period_start) + interval '1 month - 1 day')::date;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_emp record;
  v_slip uuid;
  v_status text;
  v_counted integer;
  v_skipped integer;
  v_allowance bigint;
  v_n integer := 0;
begin
  if v_start > date_trunc('month', v_today)::date then
    raise exception 'PAYROLL_FUTURE_PERIOD' using errcode = '22007';
  end if;

  for v_emp in
    select u.id, u.branch_id
    from public.users u
    where u.organization_id = v_org
      and upper(coalesce(u.role, '')) <> 'OWNER'
      and (p_employee_id is null or u.id = p_employee_id)
      and exists (
        select 1 from public.pay_profiles pp
        where pp.employee_id = u.id and pp.effective_from <= v_end
      )
    order by u.id
  loop
    v_slip := null;
    v_status := null;
    select id, status into v_slip, v_status
    from public.payslips
    where employee_id = v_emp.id and period_start = v_start and status <> 'VOID'
    for update;

    if v_slip is not null and v_status <> 'DRAFT' then
      continue; -- already published: leave it alone
    end if;

    select count(*) filter (where counted), count(*) filter (where not counted)
    into v_counted, v_skipped
    from public.payroll_work_lines(v_emp.id, v_start, v_end);

    select pp.fixed_allowance into v_allowance
    from public.pay_profiles pp
    where pp.employee_id = v_emp.id and pp.effective_from <= v_end
    order by pp.effective_from desc limit 1;

    if v_counted = 0 and v_skipped = 0 then
      -- Nothing worked this month: no payslip (and drop a stale empty draft).
      if v_slip is not null then
        delete from public.payslips where id = v_slip;
      end if;
      continue;
    end if;

    if v_slip is null then
      insert into public.payslips (organization_id, employee_id, branch_id, period_start, period_end)
      values (v_org, v_emp.id, v_emp.branch_id, v_start, v_end)
      returning id into v_slip;
    else
      delete from public.payslip_work_lines where payslip_id = v_slip;
      delete from public.payslip_items where payslip_id = v_slip and source = 'AUTO';
    end if;

    insert into public.payslip_work_lines (
      payslip_id, attendance_id, work_date, shift_name, minutes, is_overtime, hourly_rate, multiplier, amount
    )
    select v_slip, w.attendance_id, w.work_date, w.shift_name, w.minutes, w.is_overtime,
           w.hourly_rate, w.multiplier, w.amount
    from public.payroll_work_lines(v_emp.id, v_start, v_end) w
    where w.counted and w.minutes > 0;

    if v_counted > 0 and coalesce(v_allowance, 0) > 0 then
      insert into public.payslip_items (payslip_id, kind, code, label, amount, source)
      values (v_slip, 'EARNING', 'FIXED_ALLOWANCE', 'Phụ cấp cố định', v_allowance, 'AUTO');
    end if;

    update public.payslips
    set shifts_counted = v_counted, shifts_skipped = v_skipped, generated_at = now(), branch_id = v_emp.branch_id
    where id = v_slip;

    perform public.payroll_recalc(v_slip);
    v_n := v_n + 1;
  end loop;

  perform public.payroll_audit(v_org, 'GENERATE', 'payslip', null, jsonb_build_object(
    'period_start', v_start, 'employee_id', p_employee_id, 'drafts', v_n));
  return v_n;
end;
$$;

-- Add a phụ cấp / thưởng (EARNING) or a khấu trừ (DEDUCTION) to a DRAFT.
create or replace function public.add_payslip_item(
  p_payslip_id uuid, p_kind text, p_code text, p_label text, p_amount bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.payroll_require_owner();
  v_id uuid;
begin
  perform 1 from public.payslips
  where id = p_payslip_id and organization_id = v_org and status = 'DRAFT'
  for update;
  if not found then
    raise exception 'PAYSLIP_NOT_FOUND_OR_NOT_DRAFT' using errcode = 'P0002';
  end if;

  insert into public.payslip_items (payslip_id, kind, code, label, amount, source)
  values (p_payslip_id, p_kind, upper(btrim(p_code)), btrim(p_label), p_amount, 'MANUAL')
  returning id into v_id;

  perform public.payroll_recalc(p_payslip_id);
  perform public.payroll_audit(v_org, 'ADD_ITEM', 'payslip', p_payslip_id, jsonb_build_object(
    'item_id', v_id, 'kind', p_kind, 'code', upper(btrim(p_code)), 'amount', p_amount));
  return v_id;
end;
$$;

create or replace function public.remove_payslip_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.payroll_require_owner();
  v_payslip uuid;
begin
  select i.payslip_id into v_payslip
  from public.payslip_items i
  join public.payslips p on p.id = i.payslip_id
  where i.id = p_item_id and i.source = 'MANUAL' and p.organization_id = v_org and p.status = 'DRAFT'
  for update of p;
  if not found then
    raise exception 'PAYSLIP_ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  delete from public.payslip_items where id = p_item_id;
  perform public.payroll_recalc(v_payslip);
  perform public.payroll_audit(v_org, 'REMOVE_ITEM', 'payslip', v_payslip, jsonb_build_object('item_id', p_item_id));
end;
$$;

-- Publish every DRAFT of a finished month. A payslip whose employee has an unresolved khiếu nại on the
-- timesheet of that month is HELD (not published) so a disputed number never goes out as final.
create or replace function public.publish_payslips(p_period_start date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.payroll_require_owner();
  v_start date := date_trunc('month', p_period_start)::date;
  v_end date := (date_trunc('month', p_period_start) + interval '1 month - 1 day')::date;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_slip record;
  v_published integer := 0;
  v_held integer := 0;
begin
  if v_end >= v_today then
    raise exception 'PAYROLL_PERIOD_NOT_FINISHED' using errcode = '22007';
  end if;

  for v_slip in
    select id, employee_id, net_amount
    from public.payslips
    where organization_id = v_org and period_start = v_start and status = 'DRAFT'
    for update
  loop
    if exists (
      select 1 from public.attendance a
      where a.employee_id = v_slip.employee_id
        and a.work_date between v_start and v_end
        and a.complaint is not null
        and coalesce(a.complaint_status, 'OPEN') <> 'RESOLVED'
    ) then
      v_held := v_held + 1;
      continue;
    end if;

    update public.payslips
    set status = 'PUBLISHED', published_at = now(), published_by = auth.uid()
    where id = v_slip.id;
    v_published := v_published + 1;

    -- Telling the employee must never block publishing (same rule as SCRUM-76).
    begin
      if to_regprocedure('public.notify_user(uuid,text,text,text,text,uuid,interval)') is not null then
        perform public.notify_user(
          v_slip.employee_id,
          'Phiếu lương tháng ' || to_char(v_start, 'MM/YYYY') || ' đã sẵn sàng',
          'Mở mục Phiếu lương trong ứng dụng để xem chi tiết.',
          'payslip_published',
          'payslip',
          v_slip.id
        );
      end if;
    exception when others then
      null;
    end;
  end loop;

  perform public.payroll_audit(v_org, 'PUBLISH', 'payslip', null, jsonb_build_object(
    'period_start', v_start, 'published', v_published, 'held', v_held));
  return jsonb_build_object('published', v_published, 'held_for_complaints', v_held);
end;
$$;

-- Withdraw a payslip (DRAFT or PUBLISHED). The employee stops seeing it; generate again to issue a new one.
create or replace function public.void_payslip(p_payslip_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.payroll_require_owner();
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v_reason) < 5 or char_length(v_reason) > 300 then
    raise exception 'PAYSLIP_VOID_REASON_REQUIRED' using errcode = '22023';
  end if;

  perform 1 from public.payslips
  where id = p_payslip_id and organization_id = v_org and status in ('DRAFT', 'PUBLISHED')
  for update;
  if not found then
    raise exception 'PAYSLIP_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.payslips
  set status = 'VOID', void_reason = v_reason, voided_at = now()
  where id = p_payslip_id;

  perform public.payroll_audit(v_org, 'VOID', 'payslip', p_payslip_id, jsonb_build_object('reason', v_reason));
end;
$$;

create or replace function public.resolve_payslip_dispute(p_payslip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.payroll_require_owner();
begin
  update public.payslips
  set dispute_resolved_at = now()
  where id = p_payslip_id and organization_id = v_org
    and disputed_at is not null and dispute_resolved_at is null;
  if not found then
    raise exception 'PAYSLIP_NO_OPEN_DISPUTE' using errcode = 'P0002';
  end if;
  perform public.payroll_audit(v_org, 'RESOLVE_DISPUTE', 'payslip', p_payslip_id, '{}'::jsonb);
end;
$$;

-- ── 6. Employee functions (always about auth.uid(), never a parameter) ───────────────────
create or replace function public.acknowledge_payslip(p_payslip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  update public.payslips
  set acknowledged_at = coalesce(acknowledged_at, now())
  where id = p_payslip_id and employee_id = auth.uid() and status = 'PUBLISHED';
  if not found then
    raise exception 'PAYSLIP_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.dispute_payslip(p_payslip_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := btrim(coalesce(p_note, ''));
  v_org uuid;
  v_period date;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if char_length(v_note) < 5 or char_length(v_note) > 500 then
    raise exception 'PAYSLIP_DISPUTE_NOTE_LENGTH' using errcode = '22023';
  end if;

  update public.payslips
  set dispute_note = v_note, disputed_at = now(), dispute_resolved_at = null
  where id = p_payslip_id and employee_id = auth.uid() and status = 'PUBLISHED'
    and (disputed_at is null or dispute_resolved_at is not null)
  returning organization_id, period_start into v_org, v_period;
  if not found then
    raise exception 'PAYSLIP_NOT_FOUND_OR_DISPUTE_OPEN' using errcode = 'P0002';
  end if;

  begin
    if to_regprocedure('public.notify_users(uuid[],text,text,text,text,uuid,interval)') is not null
       and to_regprocedure('public.organization_owner_ids(uuid)') is not null then
      perform public.notify_users(
        public.organization_owner_ids(v_org),
        'Nhân viên thắc mắc phiếu lương ' || to_char(v_period, 'MM/YYYY'),
        v_note,
        'payslip_disputed',
        'payslip',
        p_payslip_id
      );
    end if;
  exception when others then
    null;
  end;
end;
$$;

-- Mid-month "thu nhập tạm tính" for the caller: same rule as the payslip, before deductions.
create or replace function public.my_pay_estimate(p_month date default null)
returns table (
  period_start date,
  period_end date,
  has_pay_profile boolean,
  regular_minutes integer,
  overtime_minutes integer,
  shifts_counted integer,
  shifts_skipped integer,
  work_amount bigint,
  allowance_amount bigint,
  gross_estimate bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_base date := coalesce(p_month, (now() at time zone 'Asia/Bangkok')::date);
  v_start date := date_trunc('month', v_base)::date;
  v_end date := (date_trunc('month', v_base) + interval '1 month - 1 day')::date;
  v_profile boolean;
  v_allow bigint := 0;
begin
  if v_me is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select true, pp.fixed_allowance into v_profile, v_allow
  from public.pay_profiles pp
  where pp.employee_id = v_me and pp.effective_from <= v_end
  order by pp.effective_from desc limit 1;

  return query
  with w as (select * from public.payroll_work_lines(v_me, v_start, v_end))
  select
    v_start,
    v_end,
    coalesce(v_profile, false),
    coalesce(sum(w.minutes) filter (where w.counted and not w.is_overtime), 0)::integer,
    coalesce(sum(w.minutes) filter (where w.counted and w.is_overtime), 0)::integer,
    (count(*) filter (where w.counted))::integer,
    (count(*) filter (where not w.counted))::integer,
    coalesce(sum(w.amount) filter (where w.counted), 0)::bigint,
    case when count(*) filter (where w.counted) > 0 then coalesce(v_allow, 0) else 0 end::bigint,
    (coalesce(sum(w.amount) filter (where w.counted), 0)
      + case when count(*) filter (where w.counted) > 0 then coalesce(v_allow, 0) else 0 end)::bigint
  from w;
end;
$$;

-- ── 7. Function privileges ───────────────────────────────────────────────────────────────
-- Internal helpers: nobody but the definer functions above may call them.
revoke all on function public.payroll_require_owner() from public, anon, authenticated;
revoke all on function public.payroll_audit(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.payroll_work_lines(uuid, date, date) from public, anon, authenticated;
revoke all on function public.payroll_recalc(uuid) from public, anon, authenticated;

-- Public API: signed-in only (each one re-checks the caller itself).
revoke all on function public.set_pay_profile(uuid, bigint, date, numeric, bigint, text) from public, anon;
revoke all on function public.generate_payslips(date, uuid) from public, anon;
revoke all on function public.add_payslip_item(uuid, text, text, text, bigint) from public, anon;
revoke all on function public.remove_payslip_item(uuid) from public, anon;
revoke all on function public.publish_payslips(date) from public, anon;
revoke all on function public.void_payslip(uuid, text) from public, anon;
revoke all on function public.resolve_payslip_dispute(uuid) from public, anon;
revoke all on function public.acknowledge_payslip(uuid) from public, anon;
revoke all on function public.dispute_payslip(uuid, text) from public, anon;
revoke all on function public.my_pay_estimate(date) from public, anon;

grant execute on function public.set_pay_profile(uuid, bigint, date, numeric, bigint, text) to authenticated;
grant execute on function public.generate_payslips(date, uuid) to authenticated;
grant execute on function public.add_payslip_item(uuid, text, text, text, bigint) to authenticated;
grant execute on function public.remove_payslip_item(uuid) to authenticated;
grant execute on function public.publish_payslips(date) to authenticated;
grant execute on function public.void_payslip(uuid, text) to authenticated;
grant execute on function public.resolve_payslip_dispute(uuid) to authenticated;
grant execute on function public.acknowledge_payslip(uuid) to authenticated;
grant execute on function public.dispute_payslip(uuid, text) to authenticated;
grant execute on function public.my_pay_estimate(date) to authenticated;

-- ── 8. Quick check (read-only) ───────────────────────────────────────────────────────────
-- Expect: every payroll table `rls_enabled = true` and no INSERT/UPDATE/DELETE grant for anon/authenticated.
-- select c.relname, c.relrowsecurity as rls_enabled,
--        has_table_privilege('authenticated', c.oid, 'INSERT') as can_insert,
--        has_table_privilege('authenticated', c.oid, 'UPDATE') as can_update
-- from pg_class c
-- where c.relnamespace = 'public'::regnamespace
--   and c.relname in ('pay_profiles','payslips','payslip_work_lines','payslip_items','payroll_audit_log');
