-- SCRUM-99: "Đồng bộ lại lương" + đối soát nguồn thu nhập của một tháng.
-- Run this script in Supabase Dashboard > SQL Editor, AFTER SCRUM-90_payroll.sql, SCRUM-93_final_salary.sql
-- and SCRUM-94_payroll_open_shift.sql.
--
-- What this answers: "where does this figure come from, and is the stored figure still the one the evidence
-- says?" Every number a payslip carries has a source — the hours (attendance -> `payroll_work_lines`), the
-- rate and the fixed allowance (`pay_profiles`), the AUTO allowance item, the MANUAL items somebody typed,
-- and the one `ADJUSTMENT` that `set_payslip_net` owns (SCRUM-93). This script puts those sources next to
-- what is stored, per employee, and offers one action to make them agree again.
--
-- Three rules keep it honest:
--   * the recomputed side calls `public.payroll_work_lines()` itself, so money is still computed in exactly
--     one place (SCRUM-90/94). Nothing here re-implements hours x rate x multiplier;
--   * `payroll_reconcile` writes nothing. The only writer stays `generate_payslips`, which `payroll_sync`
--     calls per employee — a "sync" cannot invent a payslip shape, and a published payslip is never touched;
--   * what a sync deliberately does NOT do is delete a draft. `generate_payslips` removes a draft whose month
--     no longer holds a single shift; a resync reports it as `WOULD_REMOVE` and leaves the decision to the
--     owner, because that draft may carry manual items somebody typed.
--
-- One consequence worth repeating, because the screen warns about it: re-running the generator drops a manual
-- `ADJUSTMENT` (SCRUM-93 §2). Its delta was measured against the hours that just changed, so keeping it would
-- make the "exact" final figure quietly wrong. `ADJUSTMENT` is one of the flags, and the owner re-enters the
-- figure after a sync changed that row's hours.
--
-- Applied by hand; idempotent: safe to re-run.

-- ── 0. Preconditions ─────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.payslips') is null
    or to_regclass('public.payslip_items') is null
    or to_regclass('public.pay_profiles') is null then
    raise exception 'SCRUM-99: run SCRUM-90_payroll.sql first (payslips, payslip_items, pay_profiles).';
  end if;

  if to_regprocedure('public.payroll_require_owner()') is null
    or to_regprocedure('public.payroll_audit(uuid, text, text, uuid, jsonb)') is null
    or to_regprocedure('public.payroll_work_lines(uuid, date, date)') is null
    or to_regprocedure('public.generate_payslips(date, uuid)') is null then
    raise exception 'SCRUM-99: run SCRUM-90_payroll.sql first (payroll_require_owner, payroll_audit, payroll_work_lines, generate_payslips).';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'attendance' and column_name = 'worked_seconds'
  ) then
    raise exception 'SCRUM-99: run SCRUM-69_attendance_worked_time.sql first (attendance.worked_seconds).';
  end if;
end $$;

-- ── 1. Đối soát: the stored figure next to the recomputed one, per employee ──────────────
-- `flags` is derived here rather than stored, for the same reason `lib/usecases/attendanceExceptions.ts`
-- derives its own vocabulary from the evidence: a verdict written next to the number can drift from it, one
-- computed from it cannot. The app treats the column as `string[]` (not a closed union), so a database one
-- script ahead can add a flag without breaking a screen — the SCRUM-62 lesson applied to a code, not a CHECK.
--
--   MISSING_PAYSLIP  a rate plus at least one paid ca, but no live payslip — the generator would create one
--   WOULD_REMOVE     a DRAFT whose month now has no ca at all — the generator would delete it (this does not)
--   STALE            a DRAFT whose stored hours, allowance or counters differ from the evidence
--   NO_ATTENDANCE    no attendance row this month at all
--   NO_RATE          a ca in the month falls before the employee's first effective rate
--   OPEN_SHIFT       a ca was counted up to its end time instead of a real giờ ra (SCRUM-94)
--   MANUAL_ITEMS     somebody typed a phụ cấp / thưởng / khấu trừ by hand
--   ADJUSTMENT       the payslip carries the chốt-lương-thực-nhận item (SCRUM-93)
create or replace function public.payroll_reconcile(p_period_start date)
returns table (
  employee_id uuid,
  full_name text,
  branch_id uuid,
  payslip_id uuid,
  status text,
  stored_work_amount bigint,
  computed_work_amount bigint,
  stored_allowance bigint,
  computed_allowance bigint,
  manual_earning bigint,
  manual_deduction bigint,
  adjustment_amount bigint,
  stored_net bigint,
  computed_net bigint,
  delta bigint,
  shifts_counted integer,
  shifts_skipped integer,
  computed_counted integer,
  computed_skipped integer,
  regular_minutes integer,
  overtime_minutes integer,
  open_shifts integer,
  flags text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.payroll_require_owner();
  v_start date := date_trunc('month', p_period_start)::date;
  v_end date := (date_trunc('month', p_period_start) + interval '1 month - 1 day')::date;
begin
  return query
  with cand as (
    -- Exactly the employees `generate_payslips` walks: not the owner, and somebody whose rate is effective
    -- inside this month. Anybody outside that set has no payslip by design, so listing them would be noise.
    select u.id, u.full_name, u.branch_id
    from public.users u
    where u.organization_id = v_org
      and upper(coalesce(u.role, '')) <> 'OWNER'
      and exists (
        select 1 from public.pay_profiles pp
        where pp.employee_id = u.id and pp.effective_from <= v_end
      )
  ),
  lineagg as (
    select
      c.id as employee_id,
      coalesce(sum(w.amount) filter (where w.counted and w.minutes > 0), 0)::bigint as computed_work,
      coalesce(sum(w.minutes) filter (where w.counted and not w.is_overtime), 0)::integer as regular_minutes,
      coalesce(sum(w.minutes) filter (where w.counted and w.is_overtime), 0)::integer as overtime_minutes,
      count(*) filter (where w.counted)::integer as computed_counted,
      count(*) filter (where not w.counted)::integer as computed_skipped,
      count(*) filter (where w.skip_reason = 'OPEN_SHIFT')::integer as open_shifts,
      count(*) filter (where w.skip_reason = 'NO_PAY_PROFILE')::integer as no_rate_rows
    from cand c
    left join lateral public.payroll_work_lines(c.id, v_start, v_end) w on true
    group by c.id
  ),
  allowagg as (
    -- The same row `generate_payslips` reads for the AUTO allowance: the latest rate effective in the month.
    select c.id as employee_id,
      coalesce((
        select pp.fixed_allowance
        from public.pay_profiles pp
        where pp.employee_id = c.id and pp.effective_from <= v_end
        order by pp.effective_from desc
        limit 1
      ), 0)::bigint as profile_allowance
    from cand c
  ),
  live as (
    select p.employee_id, p.id, p.status, p.work_amount, p.net_amount,
           p.shifts_counted, p.shifts_skipped
    from public.payslips p
    where p.organization_id = v_org
      and p.period_start = v_start
      and p.status <> 'VOID'
  ),
  itemagg as (
    -- ADJUSTMENT is excluded from the plain manual totals on purpose: it is the one MANUAL code the system
    -- itself owns, and a regenerate drops it. Counting it as "would survive a sync" would be a lie.
    select i.payslip_id,
      coalesce(sum(i.amount) filter (
        where i.kind = 'EARNING' and i.code = 'FIXED_ALLOWANCE' and i.source = 'AUTO'
      ), 0)::bigint as stored_allowance,
      coalesce(sum(i.amount) filter (
        where i.kind = 'EARNING' and i.source = 'MANUAL' and i.code <> 'ADJUSTMENT'
      ), 0)::bigint as manual_earning,
      coalesce(sum(i.amount) filter (
        where i.kind = 'DEDUCTION' and i.code <> 'ADJUSTMENT'
      ), 0)::bigint as manual_deduction,
      coalesce(sum(case when i.kind = 'EARNING' then i.amount else -i.amount end) filter (
        where i.code = 'ADJUSTMENT'
      ), 0)::bigint as adjustment_amount
    from public.payslip_items i
    group by i.payslip_id
  ),
  joined as (
    select
      c.id as employee_id,
      c.full_name,
      c.branch_id,
      l.id as payslip_id,
      l.status,
      coalesce(l.work_amount, 0)::bigint as stored_work,
      coalesce(l.net_amount, 0)::bigint as stored_net,
      coalesce(l.shifts_counted, 0)::integer as stored_counted,
      coalesce(l.shifts_skipped, 0)::integer as stored_skipped,
      a.profile_allowance,
      coalesce(it.stored_allowance, 0)::bigint as stored_allowance,
      coalesce(it.manual_earning, 0)::bigint as manual_earning,
      coalesce(it.manual_deduction, 0)::bigint as manual_deduction,
      coalesce(it.adjustment_amount, 0)::bigint as adjustment_amount,
      g.computed_work,
      g.regular_minutes,
      g.overtime_minutes,
      g.computed_counted,
      g.computed_skipped,
      g.open_shifts,
      g.no_rate_rows
    from cand c
    join lineagg g on g.employee_id = c.id
    join allowagg a on a.employee_id = c.id
    left join live l on l.employee_id = c.id
    left join itemagg it on it.payslip_id = l.id
  ),
  judged as (
    select j.*,
      (case when j.computed_counted > 0 then j.profile_allowance else 0 end)::bigint
        as computed_allowance,
      (
        j.computed_work
        + (case when j.computed_counted > 0 then j.profile_allowance else 0 end)
        + j.manual_earning
        - j.manual_deduction
      )::bigint as computed_net
    from joined j
  )
  select
    j.employee_id,
    j.full_name,
    j.branch_id,
    j.payslip_id,
    j.status,
    j.stored_work,
    j.computed_work,
    j.stored_allowance,
    j.computed_allowance,
    j.manual_earning,
    j.manual_deduction,
    j.adjustment_amount,
    j.stored_net,
    j.computed_net,
    (j.computed_net - j.stored_net)::bigint,
    j.stored_counted,
    j.stored_skipped,
    j.computed_counted,
    j.computed_skipped,
    j.regular_minutes,
    j.overtime_minutes,
    j.open_shifts,
    array_remove(array[
      case when j.status is not null then j.status end,
      case when j.payslip_id is null and j.computed_counted > 0 then 'MISSING_PAYSLIP' end,
      case when j.status = 'DRAFT' and (j.computed_counted + j.computed_skipped) = 0
        then 'WOULD_REMOVE' end,
      case when j.status = 'DRAFT'
        and (j.computed_counted + j.computed_skipped) > 0
        and (
          j.stored_work <> j.computed_work
          or j.stored_allowance <> j.computed_allowance
          or j.stored_counted <> j.computed_counted
          or j.stored_skipped <> j.computed_skipped
        ) then 'STALE' end,
      case when (j.computed_counted + j.computed_skipped) = 0 then 'NO_ATTENDANCE' end,
      case when j.no_rate_rows > 0 then 'NO_RATE' end,
      case when j.open_shifts > 0 then 'OPEN_SHIFT' end,
      case when (j.manual_earning + j.manual_deduction) > 0 then 'MANUAL_ITEMS' end,
      case when j.adjustment_amount <> 0 then 'ADJUSTMENT' end
    ]::text[], null::text)
  from judged j
  -- An employee with a rate but neither a ca nor a payslip has nothing to reconcile; leaving them out keeps
  -- the answer equal to "rows that have something to say".
  where j.payslip_id is not null
     or (j.computed_counted + j.computed_skipped) > 0
  order by j.full_name nulls last, j.employee_id;
end;
$$;

-- ── 2. Đồng bộ: make one month agree with the evidence again ─────────────────────────────
-- `p_apply = false` (the default) answers the plan and writes nothing, which is what the screen shows before
-- asking for confirmation; in that mode `after_net` is the figure the row *would* carry (`computed_net`), so the
-- preview shows a real difference rather than "no change". `p_apply = true` calls
-- `generate_payslips(p_start, employee_id)` — the one writer — for the rows that need it, then reads the figure
-- back from the payslip. `p_employee_id` narrows the run to one person, so the screen can offer a per-row button
-- without inventing a second endpoint.
--
-- `action` is what the run did or would do, `reason` is why:
--
--   CREATE / MISSING_PAYSLIP   the evidence says this month pays somebody who has no payslip
--   REFRESH / STALE            the stored hours, allowance or counters no longer match
--   SKIP / IN_SYNC             already agrees
--   SKIP / PUBLISHED           a published payslip is money already paid — never touched
--   SKIP / NO_ATTENDANCE       the month holds no ca; `generate_payslips` would DELETE the draft, a sync does not
create or replace function public.payroll_sync(
  p_period_start date,
  p_employee_id uuid default null,
  p_apply boolean default false
)
returns table (
  employee_id uuid,
  action text,
  reason text,
  before_net bigint,
  after_net bigint,
  delta bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.payroll_require_owner();
  v_start date := date_trunc('month', p_period_start)::date;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_apply boolean := coalesce(p_apply, false);
  v_row record;
  v_action text;
  v_reason text;
  v_after bigint;
begin
  if v_start > date_trunc('month', v_today)::date then
    raise exception 'PAYROLL_FUTURE_PERIOD' using errcode = '22007';
  end if;

  -- The loop reads a snapshot: `payroll_reconcile` is one statement, so a payslip created for employee A
  -- cannot change what the row for employee B says.
  for v_row in
    select r.*
    from public.payroll_reconcile(v_start) r
    where p_employee_id is null or r.employee_id = p_employee_id
    order by r.full_name nulls last, r.employee_id
  loop
    v_after := v_row.stored_net;
    v_action := 'SKIP';
    v_reason := 'IN_SYNC';

    if v_row.status = 'PUBLISHED' then
      v_reason := 'PUBLISHED';
    elsif v_row.status = 'DRAFT'
      and (v_row.computed_counted + v_row.computed_skipped) = 0 then
      -- `generate_payslips` would delete this draft. A resync does not: it may carry manual items somebody
      -- typed, and deleting money data is not a side effect of pressing "đồng bộ".
      v_reason := 'NO_ATTENDANCE';
    elsif v_row.payslip_id is null then
      v_action := 'CREATE';
      v_reason := 'MISSING_PAYSLIP';
    elsif 'STALE' = any (v_row.flags) then
      v_action := 'REFRESH';
      v_reason := 'STALE';
    end if;

    if v_apply and v_action <> 'SKIP' then
      perform public.generate_payslips(v_start, v_row.employee_id);

      select p.net_amount into v_after
      from public.payslips p
      where p.employee_id = v_row.employee_id
        and p.period_start = v_start
        and p.status <> 'VOID';

      v_after := coalesce(v_after, 0);
    elsif v_action <> 'SKIP' then
      -- Dry run: the figure the row WOULD carry afterwards. `payroll_reconcile` computed it with the same
      -- `payroll_work_lines` the generator uses, so the preview is not a guess and `delta` is a real difference
      -- — reading `stored_net` here instead would make every preview say "no change", which is a lie.
      v_after := v_row.computed_net;
    end if;

    employee_id := v_row.employee_id;
    action := v_action;
    reason := v_reason;
    before_net := v_row.stored_net;
    after_net := v_after;
    delta := v_after - v_row.stored_net;
    return next;
  end loop;

  -- Only a real run is written to the audit trail: a dry run is a read, and the log is about who changed
  -- money. `GENERATE` entries are written by the generator itself, one per employee it touched.
  if v_apply then
    perform public.payroll_audit(
      v_org,
      'SYNC',
      'payslip',
      null,
      jsonb_build_object('period_start', v_start, 'employee_id', p_employee_id)
    );
  end if;
end;
$$;

-- ── 3. Function privileges ───────────────────────────────────────────────────────────────
-- Same rule as SCRUM-90 §7: the API roles may execute these two and nothing else. Both start with
-- `payroll_require_owner()`, so `authenticated` here means "an owner, or a `42501`" — never a manager.
revoke all on function public.payroll_reconcile(date) from public, anon;
grant execute on function public.payroll_reconcile(date) to authenticated;

revoke all on function public.payroll_sync(date, uuid, boolean) from public, anon;
grant execute on function public.payroll_sync(date, uuid, boolean) to authenticated;

-- ── 4. Verification ──────────────────────────────────────────────────────────────────────
-- 4a. The functions exist, are `security definer`, and `anon` cannot execute them.
-- select p.proname, p.prosecdef as security_definer,
--        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
-- from pg_proc p
-- where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('payroll_reconcile', 'payroll_sync');
--
-- 4b. What the screen will show for one month (replace the month). Expect: a row per employee the generator
-- would touch, and `flags` naming what is wrong.
-- select employee_id, full_name, status, stored_net, computed_net, delta, flags
-- from public.payroll_reconcile(date_trunc('month', (now() at time zone 'Asia/Bangkok')::date)::date);
--
-- 4c. The definition of "nhất quán": a dry run must find nothing to do for a month that was just synced.
-- select count(*) filter (where action <> 'SKIP') as rows_needing_sync
-- from public.payroll_sync(date_trunc('month', (now() at time zone 'Asia/Bangkok')::date)::date);
-- Expect 0 right after a real run:
-- select count(*) filter (where action <> 'SKIP')
-- from public.payroll_sync(date_trunc('month', (now() at time zone 'Asia/Bangkok')::date)::date, null, true);
