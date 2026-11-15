-- SCRUM-100: Lương thử việc (demo) theo vị trí — thêm / sửa / xoá / theo dõi.
-- Run this script in Supabase Dashboard > SQL Editor, AFTER SCRUM-90_payroll.sql (it reuses
-- `payroll_require_owner()` and `payroll_audit()`).
--
-- Why a table of its own instead of a flag on `pay_profiles` / `payslips`:
--
--   * `set_pay_profile` refuses an `OWNER` as the paid employee and `generate_payslips` skips an `OWNER`, so
--     "what would the Giám đốc earn" has no path in the real payroll at all — it can only be a simulation;
--   * a demo row must never reach a KPI, `my_pay_estimate()` (what the mobile app reads) or
--     `publish_payslips`. Sharing a table with real money would make every existing query and policy depend on
--     remembering `is_demo = false`, and one forgotten filter turns a demo figure into a paid amount.
--
-- So this table touches nothing: no `attendance`, no `pay_profiles`, no `payslips`, no notification. It is a
-- worked example per position, and the screen labels it DEMO.
--
-- Money is still computed in SQL only. `gross_amount` / `net_amount` are columns whose CHECK ties them to the
-- parts (`gross = round(monthly_hours × hourly_rate) + allowance + bonus`, `net = gross − deduction`), one
-- internal function produces the gross, and no TypeScript ever multiplies hours by a rate.
--
-- `position_code` deliberately carries **no CHECK** (the SCRUM-62 lesson): the vocabulary lives in
-- `lib/domain/demoSalaryPositions.ts` and a code the app does not know must render, not make a write raise.
-- `position_title` is stored and displayed verbatim, like `requests.request_type`.
--
-- Applied by hand; idempotent: safe to re-run.

-- ── 0. Preconditions ─────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.organizations') is null or to_regclass('public.users') is null then
    raise exception 'SCRUM-100: run SCRUM-51_organizations.sql first (organizations, users).';
  end if;

  if to_regprocedure('public.payroll_require_owner()') is null
    or to_regprocedure('public.payroll_audit(uuid, text, text, uuid, jsonb)') is null then
    raise exception 'SCRUM-100: run SCRUM-90_payroll.sql first (payroll_require_owner, payroll_audit).';
  end if;

  if to_regprocedure('public.is_organization_owner()') is null then
    raise exception 'SCRUM-100: run SCRUM-59_role_model.sql first (is_organization_owner).';
  end if;
end $$;

-- ── 1. The table ─────────────────────────────────────────────────────────────────────────
create table if not exists public.demo_pay_salaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id()
    references public.organizations (id),
  position_code text not null,
  position_title text not null,
  monthly_hours numeric(6, 2) not null,
  hourly_rate bigint not null,
  allowance_amount bigint not null default 0,
  bonus_amount bigint not null default 0,
  deduction_amount bigint not null default 0,
  gross_amount bigint not null,
  net_amount bigint not null,
  effective_from date not null,
  status text not null default 'ACTIVE',
  note text,
  created_by uuid references public.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint demo_pay_salaries_position_code_check
    check (char_length(btrim(position_code)) between 2 and 40),
  constraint demo_pay_salaries_position_title_check
    check (char_length(btrim(position_title)) between 2 and 80),
  constraint demo_pay_salaries_hours_check
    check (monthly_hours > 0 and monthly_hours <= 744),
  constraint demo_pay_salaries_rate_check
    check (hourly_rate >= 0 and hourly_rate <= 10000000),
  -- The same shape as `payslips_amounts_check`: the row cannot contradict its own parts.
  constraint demo_pay_salaries_amounts_check check (
    allowance_amount >= 0 and allowance_amount <= 1000000000
    and bonus_amount >= 0 and bonus_amount <= 1000000000
    and deduction_amount >= 0 and deduction_amount <= 1000000000
    and gross_amount = round(monthly_hours * hourly_rate)::bigint + allowance_amount + bonus_amount
    and deduction_amount <= gross_amount
    and net_amount = gross_amount - deduction_amount
  ),
  constraint demo_pay_salaries_status_check
    check (status in ('ACTIVE', 'ARCHIVED')),
  constraint demo_pay_salaries_note_check
    check (note is null or char_length(note) <= 500)
);

-- One live row per position per effective day. `ARCHIVED` is excluded so "ngừng theo dõi" frees that pair for
-- a new row, exactly like `payslips_employee_period_live_idx` ignores a VOID payslip.
create unique index if not exists demo_pay_salaries_position_from_key
  on public.demo_pay_salaries (organization_id, position_code, effective_from)
  where status <> 'ARCHIVED';

create index if not exists demo_pay_salaries_org_idx
  on public.demo_pay_salaries (organization_id, effective_from desc);

-- ── 2. Privileges and RLS ────────────────────────────────────────────────────────────────
-- Same discipline as the five payroll tables: the API role may READ, and every change goes through a
-- `security definer` function. A client that could write `net_amount` could invent a salary.
revoke all on table public.demo_pay_salaries from public, anon, authenticated;
grant select on table public.demo_pay_salaries to authenticated;

alter table public.demo_pay_salaries enable row level security;

-- The trial salary of a position is the most sensitive row in the app after real payroll, so only the
-- organization's owner reads it. There is deliberately no INSERT/UPDATE/DELETE policy.
drop policy if exists demo_pay_salaries_select_owner on public.demo_pay_salaries;
create policy demo_pay_salaries_select_owner on public.demo_pay_salaries
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  );

-- ── 3. The one place hours become a trial gross ──────────────────────────────────────────
-- Internal helper (revoked below), used by create and update so the two can never disagree about the formula,
-- and so the CHECK of the table and the value the RPC writes are the same arithmetic.
create or replace function public.demo_pay_gross(
  p_monthly_hours numeric,
  p_hourly_rate bigint,
  p_allowance_amount bigint,
  p_bonus_amount bigint
)
returns bigint
language sql
immutable
as $$
  select round(p_monthly_hours * p_hourly_rate)::bigint
    + coalesce(p_allowance_amount, 0)
    + coalesce(p_bonus_amount, 0);
$$;

-- ── 4. Owner functions ───────────────────────────────────────────────────────────────────
-- Thêm một mức lương thử việc. `p_status` omitted answers the column default (`ACTIVE`).
create or replace function public.create_demo_pay_salary(
  p_position_code text,
  p_position_title text,
  p_monthly_hours numeric,
  p_hourly_rate bigint,
  p_allowance_amount bigint default 0,
  p_bonus_amount bigint default 0,
  p_deduction_amount bigint default 0,
  p_effective_from date default null,
  p_note text default null,
  p_status text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.payroll_require_owner();
  v_hours numeric := coalesce(p_monthly_hours, 0);
  v_rate bigint := coalesce(p_hourly_rate, 0);
  v_allowance bigint := coalesce(p_allowance_amount, 0);
  v_bonus bigint := coalesce(p_bonus_amount, 0);
  v_deduction bigint := coalesce(p_deduction_amount, 0);
  v_gross bigint;
  v_id uuid;
begin
  if p_position_code is null or btrim(p_position_code) = ''
    or p_position_title is null or btrim(p_position_title) = '' then
    raise exception 'DEMO_PAY_POSITION_REQUIRED' using errcode = '22023';
  end if;

  v_gross := public.demo_pay_gross(v_hours, v_rate, v_allowance, v_bonus);

  -- Money arithmetic, so it stays here: the parser cannot know the totals it would have to compare.
  if v_deduction > v_gross then
    raise exception 'DEMO_PAY_DEDUCTIONS_EXCEED_GROSS' using errcode = '22023';
  end if;

  begin
    insert into public.demo_pay_salaries (
      organization_id, position_code, position_title, monthly_hours, hourly_rate,
      allowance_amount, bonus_amount, deduction_amount, gross_amount, net_amount,
      effective_from, status, note
    )
    values (
      v_org, btrim(p_position_code), btrim(p_position_title), v_hours, v_rate,
      v_allowance, v_bonus, v_deduction, v_gross, v_gross - v_deduction,
      coalesce(p_effective_from, (now() at time zone 'Asia/Bangkok')::date),
      coalesce(p_status, 'ACTIVE'), nullif(btrim(p_note), '')
    )
    returning id into v_id;
  exception
    when unique_violation then
      -- A bare 23505 would reach the caller as a `500` with Postgres' own sentence; the app needs the token.
      raise exception 'DEMO_PAY_DUPLICATE' using errcode = '23505';
  end;

  perform public.payroll_audit(v_org, 'CREATE_DEMO_PAY_SALARY', 'demo_pay_salary', v_id, jsonb_build_object(
    'position_code', btrim(p_position_code), 'monthly_hours', v_hours, 'hourly_rate', v_rate,
    'gross_amount', v_gross, 'net_amount', v_gross - v_deduction));

  return v_id;
end;
$$;

-- Sửa một mức lương thử việc: mọi trường, kể cả `effective_from` và `position_code`. `p_status` omitted keeps
-- the stored value, the same contract an optional field has everywhere else in this app.
create or replace function public.update_demo_pay_salary(
  p_id uuid,
  p_position_code text,
  p_position_title text,
  p_monthly_hours numeric,
  p_hourly_rate bigint,
  p_allowance_amount bigint default 0,
  p_bonus_amount bigint default 0,
  p_deduction_amount bigint default 0,
  p_effective_from date default null,
  p_note text default null,
  p_status text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.payroll_require_owner();
  v_row public.demo_pay_salaries;
  v_hours numeric := coalesce(p_monthly_hours, 0);
  v_rate bigint := coalesce(p_hourly_rate, 0);
  v_allowance bigint := coalesce(p_allowance_amount, 0);
  v_bonus bigint := coalesce(p_bonus_amount, 0);
  v_deduction bigint := coalesce(p_deduction_amount, 0);
  v_gross bigint;
begin
  select * into v_row
  from public.demo_pay_salaries
  where id = p_id and organization_id = v_org
  for update;

  if not found then
    raise exception 'DEMO_PAY_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_position_code is null or btrim(p_position_code) = ''
    or p_position_title is null or btrim(p_position_title) = '' then
    raise exception 'DEMO_PAY_POSITION_REQUIRED' using errcode = '22023';
  end if;

  v_gross := public.demo_pay_gross(v_hours, v_rate, v_allowance, v_bonus);

  if v_deduction > v_gross then
    raise exception 'DEMO_PAY_DEDUCTIONS_EXCEED_GROSS' using errcode = '22023';
  end if;

  begin
    update public.demo_pay_salaries
    set position_code = btrim(p_position_code),
        position_title = btrim(p_position_title),
        monthly_hours = v_hours,
        hourly_rate = v_rate,
        allowance_amount = v_allowance,
        bonus_amount = v_bonus,
        deduction_amount = v_deduction,
        gross_amount = v_gross,
        net_amount = v_gross - v_deduction,
        effective_from = coalesce(p_effective_from, effective_from),
        status = coalesce(p_status, status),
        note = nullif(btrim(p_note), ''),
        updated_at = now()
    where id = p_id;
  exception
    when unique_violation then
      raise exception 'DEMO_PAY_DUPLICATE' using errcode = '23505';
  end;

  perform public.payroll_audit(v_org, 'UPDATE_DEMO_PAY_SALARY', 'demo_pay_salary', p_id, jsonb_build_object(
    'position_code', btrim(p_position_code), 'monthly_hours', v_hours, 'hourly_rate', v_rate,
    'gross_amount', v_gross, 'net_amount', v_gross - v_deduction,
    'status', coalesce(p_status, v_row.status)));

  return p_id;
end;
$$;

-- Ngừng theo dõi: `ARCHIVED` keeps the figures and excludes the row from `demo_pay_summary`'s totals.
create or replace function public.archive_demo_pay_salary(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.payroll_require_owner();
  v_status text;
begin
  select status into v_status
  from public.demo_pay_salaries
  where id = p_id and organization_id = v_org
  for update;

  if not found then
    raise exception 'DEMO_PAY_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.demo_pay_salaries
  set status = 'ARCHIVED', updated_at = now()
  where id = p_id;

  perform public.payroll_audit(v_org, 'ARCHIVE_DEMO_PAY_SALARY', 'demo_pay_salary', p_id,
    jsonb_build_object('from_status', v_status));

  return p_id;
end;
$$;

-- Xoá hẳn. The removed row is copied into the audit log first, so "who deleted which trial salary, and what
-- did it say" is still answerable after the row is gone.
create or replace function public.delete_demo_pay_salary(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.payroll_require_owner();
  v_row public.demo_pay_salaries;
begin
  select * into v_row
  from public.demo_pay_salaries
  where id = p_id and organization_id = v_org
  for update;

  if not found then
    raise exception 'DEMO_PAY_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.payroll_audit(v_org, 'DELETE_DEMO_PAY_SALARY', 'demo_pay_salary', p_id, to_jsonb(v_row));

  delete from public.demo_pay_salaries where id = p_id;
end;
$$;

-- ── 5. Theo dõi: one jsonb the screen can render without recomputing anything ────────────
-- Only `ACTIVE` rows are summed: "ngừng theo dõi" has to mean the KPI changes, otherwise the button is a label
-- with no effect. The per-position block is ordered by gross so the list reads like a ranking.
create or replace function public.demo_pay_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.payroll_require_owner();
begin
  return jsonb_build_object(
    'active_records', (
      select count(*) from public.demo_pay_salaries d
      where d.organization_id = v_org and d.status = 'ACTIVE'
    ),
    'archived_records', (
      select count(*) from public.demo_pay_salaries d
      where d.organization_id = v_org and d.status = 'ARCHIVED'
    ),
    'gross_total', (
      select coalesce(sum(d.gross_amount), 0) from public.demo_pay_salaries d
      where d.organization_id = v_org and d.status = 'ACTIVE'
    ),
    'net_total', (
      select coalesce(sum(d.net_amount), 0) from public.demo_pay_salaries d
      where d.organization_id = v_org and d.status = 'ACTIVE'
    ),
    'positions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'position_code', p.position_code,
          'position_title', p.position_title,
          'records', p.records,
          'gross_total', p.gross_total,
          'net_total', p.net_total
        )
        order by p.gross_total desc, p.position_code
      )
      from (
        select d.position_code,
               min(d.position_title) as position_title,
               count(*) as records,
               sum(d.gross_amount) as gross_total,
               sum(d.net_amount) as net_total
        from public.demo_pay_salaries d
        where d.organization_id = v_org and d.status = 'ACTIVE'
        group by d.position_code
      ) p
    ), '[]'::jsonb)
  );
end;
$$;

-- ── 6. Function privileges ───────────────────────────────────────────────────────────────
-- The internal helper is not callable by an API role at all; the five owner functions are, and each of them
-- starts with `payroll_require_owner()` — so "authenticated" here means "the organization's owner, or a 42501".
revoke all on function public.demo_pay_gross(numeric, bigint, bigint, bigint)
  from public, anon, authenticated;

revoke all on function public.create_demo_pay_salary(text, text, numeric, bigint, bigint, bigint, bigint, date, text, text)
  from public, anon;
grant execute on function public.create_demo_pay_salary(text, text, numeric, bigint, bigint, bigint, bigint, date, text, text)
  to authenticated;

revoke all on function public.update_demo_pay_salary(uuid, text, text, numeric, bigint, bigint, bigint, bigint, date, text, text)
  from public, anon;
grant execute on function public.update_demo_pay_salary(uuid, text, text, numeric, bigint, bigint, bigint, bigint, date, text, text)
  to authenticated;

revoke all on function public.archive_demo_pay_salary(uuid) from public, anon;
grant execute on function public.archive_demo_pay_salary(uuid) to authenticated;

revoke all on function public.delete_demo_pay_salary(uuid) from public, anon;
grant execute on function public.delete_demo_pay_salary(uuid) to authenticated;

revoke all on function public.demo_pay_summary() from public, anon;
grant execute on function public.demo_pay_summary() to authenticated;

-- ── 7. Verification ──────────────────────────────────────────────────────────────────────
-- 7a. The table is there, RLS is on, and `authenticated` may only read it.
-- select relrowsecurity as rls_enabled,
--        has_table_privilege('authenticated', 'public.demo_pay_salaries', 'SELECT') as can_read,
--        has_table_privilege('authenticated', 'public.demo_pay_salaries', 'INSERT') as can_insert,
--        has_table_privilege('authenticated', 'public.demo_pay_salaries', 'UPDATE') as can_update,
--        has_table_privilege('authenticated', 'public.demo_pay_salaries', 'DELETE') as can_delete
-- from pg_class where oid = 'public.demo_pay_salaries'::regclass;
-- Expect: rls_enabled = true, can_read = true, and the other three false.
--
-- 7b. There is exactly one policy, and it is a SELECT policy for the owner.
-- select polname, polcmd, pg_get_expr(polqual, polrelid) as using_expression
-- from pg_policy where polrelid = 'public.demo_pay_salaries'::regclass;
--
-- 7c. The functions exist, are `security definer`, and `anon` cannot execute them.
-- select p.proname, p.prosecdef as security_definer,
--        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
-- from pg_proc p
-- where p.pronamespace = 'public'::regnamespace
--   and p.proname like '%demo_pay%'
-- order by p.proname;
-- Expect: demo_pay_gross has authenticated_can_execute = false, the other five true, anon false everywhere.
--
-- 7d. Behaviour test. It calls `payroll_require_owner()`, which needs a session — so run it from the app (or a
-- client authenticated as the organization's owner), not from this editor, where `auth.uid()` is null.
-- begin;
--   select public.create_demo_pay_salary('DIRECTOR', 'Giám đốc công ty', 208, 120000, 5000000, 0, 0,
--     current_date, 'scrum-100 check');
--   -- Expect gross = 208 × 120000 + 5000000 = 29.960.000 and net = gross.
--   select position_code, gross_amount, net_amount, status from public.demo_pay_salaries;
--   select public.demo_pay_summary();
-- rollback;
