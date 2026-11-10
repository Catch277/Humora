-- SCRUM-92: Đơn giá giờ (pay_profiles) — sửa và xoá một dòng đã lưu.
-- Run this script in Supabase Dashboard > SQL Editor, AFTER SCRUM-90_payroll.sql.
--
-- Why this script exists (SCRUM-90 shipped create + read only):
--
--   * `set_pay_profile` is an upsert on `(employee_id, effective_from)`, so a mistyped `hourly_rate` could
--     only be corrected by re-typing the row *on the same day* it applied, and a row saved with a wrong
--     `effective_from` could not be corrected at all. An edit needs the row id, which is what
--     `update_pay_profile` takes.
--   * A rate that was never meant to be stored (the wrong employee picked in the form) had no way out: the
--     payroll tables carry a SELECT policy only and INSERT/UPDATE/DELETE are revoked from `anon` and
--     `authenticated`, so `delete_pay_profile` is the only door — and it writes the row into
--     `payroll_audit_log` before removing it.
--   * Both functions keep the shape of every other payroll write: `security definer`, first statement
--     `payroll_require_owner()`, the organization read from the session and never from a parameter, and the
--     audit entry written in the same transaction as the change.
--
-- What an edit or a delete does NOT do: it never touches a payslip. The amounts of a payslip are snapshots
-- (`payslip_work_lines.hourly_rate`, `multiplier`, `amount`), so a published month keeps the figure it was
-- built from, and a DRAFT is rebuilt from scratch by `generate_payslips` the next time it runs. That is also
-- why deleting the last rate of somebody only means the generator skips them — the screen counts those
-- people under "chưa có đơn giá giờ" instead of failing.
--
-- Applied by hand; idempotent: safe to re-run.

-- ── 0. Preconditions ─────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.pay_profiles') is null then
    raise exception 'SCRUM-92: run SCRUM-90_payroll.sql first (public.pay_profiles).';
  end if;

  if to_regprocedure('public.payroll_require_owner()') is null
    or to_regprocedure('public.payroll_audit(uuid, text, text, uuid, jsonb)') is null then
    raise exception 'SCRUM-92: run SCRUM-90_payroll.sql first (payroll_require_owner, payroll_audit).';
  end if;
end $$;

-- ── 1. `updated_at` ──────────────────────────────────────────────────────────────────────
-- SCRUM-90 declared only `created_at`, so an edit left no trace on the row itself.
-- The app deliberately does NOT select this column: a project that has not run this script keeps working,
-- because a `42703` on `GET /api/payroll/profiles` would otherwise take `/payroll` and `/staff` down with it.
alter table public.pay_profiles
  add column if not exists updated_at timestamptz not null default now();

-- ── 2. Edit one stored rate ──────────────────────────────────────────────────────────────
-- Every field of a rate is editable, including `effective_from` — that is the point: a row saved with the
-- wrong effective day is the case `set_pay_profile` cannot fix. Moving the day onto another row of the same
-- employee breaks `pay_profiles_employee_from_key`, which answers `PAY_PROFILE_DUPLICATE` (→ `409`) instead
-- of a bare `23505` the app could only report as an internal error.
create or replace function public.update_pay_profile(
  p_id uuid,
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
  v_before public.pay_profiles;
  v_after public.pay_profiles;
begin
  -- `for update` also locks out a concurrent delete of the same row between this read and the write below.
  select * into v_before
  from public.pay_profiles
  where id = p_id and organization_id = v_org
  for update;

  if not found then
    raise exception 'PAY_PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- The same rule `set_pay_profile` applies: the owner of the organization stands above every branch and is
  -- never paid through a payslip, so a rate is only ever stored for a MANAGER or an EMPLOYEE.
  if not exists (
    select 1 from public.users u
    where u.id = v_before.employee_id
      and u.organization_id = v_org
      and upper(coalesce(u.role, '')) <> 'OWNER'
  ) then
    raise exception 'PAYROLL_EMPLOYEE_NOT_FOUND' using errcode = 'P0002';
  end if;

  begin
    update public.pay_profiles
      set hourly_rate = p_hourly_rate,
          effective_from = p_effective_from,
          overtime_multiplier = p_overtime_multiplier,
          fixed_allowance = coalesce(p_fixed_allowance, 0),
          note = nullif(btrim(p_note), ''),
          updated_at = now()
      where id = p_id
      returning * into v_after;
  exception
    when unique_violation then
      raise exception 'PAY_PROFILE_DUPLICATE' using errcode = '23505';
  end;

  perform public.payroll_audit(v_org, 'UPDATE_PAY_PROFILE', 'pay_profile', p_id, jsonb_build_object(
    'before', to_jsonb(v_before),
    'after', to_jsonb(v_after)));

  return p_id;
end;
$$;

-- ── 3. Delete one stored rate ────────────────────────────────────────────────────────────
-- Published payslips keep their snapshotted amounts, so the deletion is safe for history; what it changes is
-- the future, which is why the full row (and who removed it) is stored in the audit log first.
create or replace function public.delete_pay_profile(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.payroll_require_owner();
  v_row public.pay_profiles;
begin
  select * into v_row
  from public.pay_profiles
  where id = p_id and organization_id = v_org
  for update;

  if not found then
    raise exception 'PAY_PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.payroll_audit(v_org, 'DELETE_PAY_PROFILE', 'pay_profile', p_id, jsonb_build_object(
    'deleted', to_jsonb(v_row)));

  delete from public.pay_profiles where id = p_id;
end;
$$;

-- ── 4. Function privileges ───────────────────────────────────────────────────────────────
-- Same rule as SCRUM-90 §7: the app roles may execute the two public writes and nothing else.
revoke all on function public.update_pay_profile(uuid, bigint, date, numeric, bigint, text) from public, anon;
revoke all on function public.delete_pay_profile(uuid) from public, anon;

grant execute on function public.update_pay_profile(uuid, bigint, date, numeric, bigint, text) to authenticated;
grant execute on function public.delete_pay_profile(uuid) to authenticated;

-- ── 5. Quick check (read-only) ───────────────────────────────────────────────────────────
-- Expect: both functions exist, both are `security definer`, and no `anon` EXECUTE grant.
-- select p.proname, p.prosecdef as security_definer,
--        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
-- from pg_proc p
-- where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('update_pay_profile', 'delete_pay_profile');
--
-- Expect: `updated_at` present on the table.
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'pay_profiles'
-- order by ordinal_position;
--
-- Behaviour test, rolled back so nothing is stored: it must answer `OK`.
-- begin;
--   insert into public.pay_profiles (organization_id, employee_id, hourly_rate, effective_from)
--   select u.organization_id, u.id, 50000, current_date
--   from public.users u
--   where u.organization_id is not null and upper(coalesce(u.role, '')) <> 'OWNER'
--   limit 1;
--   do $$
--   declare v_id uuid;
--   begin
--     select id into v_id from public.pay_profiles order by created_at desc limit 1;
--     if v_id is null then
--       raise notice 'SKIPPED: no non-owner account to try with.';
--     else
--       perform public.update_pay_profile(v_id, 60000, current_date + 1, 1.5, 0, 'scrum-92 check');
--       perform public.delete_pay_profile(v_id);
--       raise notice 'OK';
--     end if;
--   end $$;
-- rollback;
