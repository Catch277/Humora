-- SCRUM-93: "Chốt lương thực nhận" — the owner sets the exact final figure of ONE draft payslip.
-- Run this script in Supabase Dashboard > SQL Editor, AFTER SCRUM-90_payroll.sql and SCRUM-92_pay_profile_crud.sql.
--
-- What this is: the hourly money stays the base (`work_amount`), and the difference between that base and the
-- number the owner wants the employee to receive is stored as ONE `ADJUSTMENT` item — an `EARNING` when the
-- final figure is higher, a `DEDUCTION` when it is lower. Nothing invents a second source of truth:
--
--   * there is no `net_amount` override column, so the payslip's own arithmetic keeps holding
--     (`gross = work + other_earnings`, `net = gross − deduction`, enforced by CHECK) and the employee can
--     read *why* the number differs from the hours worked;
--   * it is a per-payslip action (one employee × one month), not a standing rule: a monthly adjustment that
--     repeats on its own would have to change `my_pay_estimate()` — the function the mobile app reads — which
--     is a separate ticket;
--   * the same rules as everywhere else in payroll: `security definer`, first statement
--     `payroll_require_owner()`, the organization read from the session, DRAFT only (a published payslip is
--     the record of money already paid), and an audit entry in the same transaction.
--
-- One deliberate consequence: `generate_payslips` is re-created below (identical to SCRUM-90's, plus ONE
-- delete) so that regenerating a month drops a stale manual `ADJUSTMENT`. Its delta was measured against the
-- hours that just changed, and keeping it would make the "exact" figure quietly wrong. The owner re-enters
-- the figure after regenerating, and `payroll_audit_log` keeps both attempts.
--
-- Applied by hand; idempotent: safe to re-run.

-- ── 0. Preconditions ─────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.payslips') is null
    or to_regclass('public.payslip_items') is null
    or to_regclass('public.pay_profiles') is null then
    raise exception 'SCRUM-93: run SCRUM-90_payroll.sql first (payslips, payslip_items, pay_profiles).';
  end if;

  if to_regprocedure('public.payroll_require_owner()') is null
    or to_regprocedure('public.payroll_recalc(uuid)') is null
    or to_regprocedure('public.payroll_audit(uuid, text, text, uuid, jsonb)') is null then
    raise exception 'SCRUM-93: run SCRUM-90_payroll.sql first (payroll_require_owner, payroll_recalc, payroll_audit).';
  end if;
end $$;

-- ── 1. Set the exact final figure of one DRAFT ───────────────────────────────────────────
-- `p_target_net` is what the employee receives this month, 0..1.000.000.000 VND. Calling it again replaces
-- the previous adjustment instead of stacking a second one, so the control behaves like a field rather than
-- like a button that adds money each time it is pressed.
create or replace function public.set_payslip_net(
  p_payslip_id uuid,
  p_target_net bigint,
  p_note text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.payroll_require_owner();
  v_slip public.payslips;
  v_delta bigint;
  v_net bigint;
begin
  if p_target_net is null or p_target_net < 0 or p_target_net > 1000000000 then
    raise exception 'PAYSLIP_TARGET_INVALID' using errcode = '22023';
  end if;

  select * into v_slip
  from public.payslips
  where id = p_payslip_id and organization_id = v_org
  for update;

  if not found then
    raise exception 'PAYSLIP_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- A published payslip is a frozen record of money that was paid; a correction is "huỷ" + generate again.
  if v_slip.status <> 'DRAFT' then
    raise exception 'PAYSLIP_IMMUTABLE: only a draft payslip can be re-priced' using errcode = 'P0001';
  end if;

  delete from public.payslip_items
  where payslip_id = p_payslip_id and code = 'ADJUSTMENT' and source = 'MANUAL';

  v_delta := p_target_net - v_slip.net_amount;

  if v_delta > 0 then
    insert into public.payslip_items (payslip_id, kind, code, label, amount, source)
    values (p_payslip_id, 'EARNING', 'ADJUSTMENT', 'Điều chỉnh lương', v_delta, 'MANUAL');
  elsif v_delta < 0 then
    -- `payslips_amounts_check` would refuse a deduction bigger than the gross, so the caller gets the payroll
    -- token (`400`) instead of a bare `23514` it could only report as an internal error.
    if v_slip.deduction_amount + abs(v_delta) > v_slip.gross_amount then
      raise exception 'PAYSLIP_DEDUCTIONS_EXCEED_GROSS' using errcode = '23514';
    end if;

    insert into public.payslip_items (payslip_id, kind, code, label, amount, source)
    values (p_payslip_id, 'DEDUCTION', 'ADJUSTMENT', 'Điều chỉnh lương', abs(v_delta), 'MANUAL');
  end if;

  perform public.payroll_recalc(p_payslip_id);

  select net_amount into v_net from public.payslips where id = p_payslip_id;

  -- An invariant, not a user error: if the arithmetic ever stops landing on the requested figure, the
  -- transaction must fail rather than store a number that answers something else.
  if v_net is distinct from p_target_net then
    raise exception 'PAYSLIP_NET_MISMATCH: expected %, stored %', p_target_net, v_net
      using errcode = 'P0001';
  end if;

  perform public.payroll_audit(v_org, 'SET_PAYSLIP_NET', 'payslip', p_payslip_id, jsonb_build_object(
    'target_net', p_target_net, 'delta', v_delta, 'note', nullif(btrim(p_note), '')));

  return v_net;
end;
$$;

-- ── 2. `generate_payslips`, with the stale adjustment dropped ────────────────────────────
-- A verbatim copy of SCRUM-90's function with ONE added statement (marked below). Re-created rather than
-- edited because SCRUM-90 has already been applied — the rule of this folder. If the generator ever changes,
-- both scripts must change together.
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

      -- SCRUM-93: the exact figure set by `set_payslip_net` was measured against the hours about to be
      -- replaced, so it cannot survive a regenerate without lying about the amount. `AUTO` items were just
      -- dropped above; this is the one MANUAL code the system itself owns.
      delete from public.payslip_items
      where payslip_id = v_slip and code = 'ADJUSTMENT' and source = 'MANUAL';
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

-- ── 3. Function privileges ───────────────────────────────────────────────────────────────
-- Same rule as SCRUM-90 §7: the app roles may execute the one public write and nothing else.
revoke all on function public.set_payslip_net(uuid, bigint, text) from public, anon;
grant execute on function public.set_payslip_net(uuid, bigint, text) to authenticated;

-- ── 4. Quick check (read-only) ───────────────────────────────────────────────────────────
-- Expect: the function exists, is `security definer`, and `anon` cannot execute it.
-- select p.proname, p.prosecdef as security_definer,
--        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
-- from pg_proc p
-- where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('set_payslip_net', 'generate_payslips');
--
-- Behaviour test, rolled back so nothing is stored. It needs one DRAFT payslip; on a fresh project it says
-- SKIPPED instead. Expect `OK`.
-- begin;
--   do $$
--   declare v_id uuid; v_net bigint; v_rows integer;
--   begin
--     select id into v_id from public.payslips where status = 'DRAFT' order by created_at desc limit 1;
--     if v_id is null then
--       raise notice 'SKIPPED: no draft payslip to re-price.';
--     else
--       v_net := public.set_payslip_net(v_id, 1000000, 'scrum-93 check');
--       if v_net <> 1000000 then
--         raise exception 'net % does not match the target', v_net;
--       end if;
--       select count(*) into v_rows
--       from public.payslip_items
--       where payslip_id = v_id and code = 'ADJUSTMENT' and source = 'MANUAL';
--       if v_rows <> 1 then
--         raise exception 'expected exactly one adjustment row, found %', v_rows;
--       end if;
--       raise notice 'OK';
--     end if;
--   end $$;
-- rollback;
