-- ============================================================================
-- SCRUM-82 — a đơn carries the day it is about (and, for đổi ca, the ca and the colleague)
-- ============================================================================
--
-- The rule this script makes possible: a request form that knows *which day* it is asking about.
-- Until now `public.requests` was the queue of SCRUM-41 with a type, a title and free text — no date,
-- no ca — so nothing could act on what the employee asked for: a "Nghỉ phép" đơn could not become a
-- day off in the schedule, and a "Đổi ca" đơn could not name the colleague who takes the ca. The
-- three columns below are that missing information.
--
--   * `work_date`           — the day the đơn is about. Required by the app for every type that acts on
--                             a day (nghỉ phép, đổi ca, điều chỉnh công) and refused when it is in the past.
--   * `shift_id`            — the ca being handed over (`public.shifts.id`), for "Đổi ca" only.
--   * `target_employee_id`  — the colleague who takes that ca (`public.users.id`), for "Đổi ca" only.
--
-- Why these are nullable and why there is deliberately **no** CHECK constraint here: `requests` was
-- hand-created in the dashboard, and the project carries đơn rows written before this script whose
-- `work_date` is null. A `CHECK` is *enforced on every UPDATE* even when it is added `NOT VALID`, so a
-- constraint demanding a date would make approving one of those legacy đơn fail with `23514` — the
-- SCRUM-62 lesson about a schema mismatch wearing the costume of a server bug. The shape is therefore
-- guarded by an `INSERT`-only trigger (`SCRUM-83_request_effects.sql`), which leaves every existing row
-- and every later UPDATE of it alone. `on delete set null` on the two foreign keys costs nothing either
-- for the same reason: nothing demands those columns stay filled.
--
-- What the RPC does: `eligible_swap_targets()` answers the one question the "Đổi ca" form asks — who in
-- my branch is free to take this ca. It cannot be a PostgREST read, because the SCRUM-63 read policy on
-- `shift_assignments` lets an account see *its own* rows and a manager the whole organization, never a
-- colleague's roster — so an `EMPLOYEE` picking a swap partner would see an empty list. The function is
-- `security definer` for that reason and re-uses `public.shift_conflict_reason()` (SCRUM-23) as the
-- single copy of "that person is not free", so the picker and the approval can never disagree.
--
-- Apply by hand: Supabase Dashboard → SQL Editor → paste → Run. Idempotent: re-running only adds what is
-- missing (`add column if not exists`, guarded constraints, `create or replace function`).
-- **Deploy order: this script before the build that ships it** — `GET /api/requests` selects the three
-- new columns, so a database without them answers `42703 column requests.work_date does not exist` on
-- every request read (the same trap `SCRUM-63` has with `users.branch_id`).

-- ── Preconditions ───────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.requests') is null
    or to_regclass('public.shifts') is null
    or to_regclass('public.users') is null then
    raise exception 'SCRUM-82: run SCRUM-41_request_review.sql and SCRUM-30_schedule.sql first (requests, shifts, users).';
  end if;

  if not exists (select 1 from pg_proc where proname = 'shift_conflict_reason') then
    raise exception 'SCRUM-82: run SCRUM-23_shift_registration_swap.sql first — public.shift_conflict_reason() is missing.';
  end if;

  if not exists (select 1 from pg_proc where proname = 'current_branch_id') then
    raise exception 'SCRUM-82: run SCRUM-63_employee_branch.sql first — public.current_branch_id() is missing.';
  end if;
end $$;

-- ── 1. The three columns ─────────────────────────────────────────────────────────────────────
alter table public.requests add column if not exists work_date date;
alter table public.requests add column if not exists shift_id uuid;
alter table public.requests add column if not exists target_employee_id uuid;

-- The ca a swap hands over: deleting a template that an open đơn names simply drops the reference
-- (the đơn keeps its date and text and the approval refuses it — see SCRUM-83), because deleting the
-- employee's own request would lose the record of what they asked for.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'requests_shift_id_fkey'
      and conrelid = 'public.requests'::regclass
  ) then
    alter table public.requests
      add constraint requests_shift_id_fkey
      foreign key (shift_id) references public.shifts (id) on delete set null not valid;
  end if;

  -- The colleague who takes the ca. `not valid` for the same reason as `requests_user_id_fkey`
  -- (SCRUM-41): rows written before this script are not re-checked, while every new row is.
  if not exists (
    select 1
    from pg_constraint
    where conname = 'requests_target_employee_id_fkey'
      and conrelid = 'public.requests'::regclass
  ) then
    alter table public.requests
      add constraint requests_target_employee_id_fkey
      foreign key (target_employee_id) references public.users (id) on delete set null not valid;
  end if;
end $$;

-- "What is on that day" is asked per branch (the schedule screen's shape) and per person (the form).
create index if not exists requests_work_date_idx on public.requests (work_date);
create index if not exists requests_target_employee_idx on public.requests (target_employee_id);

-- One open swap đơn per ca, the same invariant `shift_swaps_open_assignment_idx` (SCRUM-23) keeps for
-- the accept-then-approve flow: a ca cannot be promised to two colleagues at once. A rejected or
-- approved one does not block filing again.
create unique index if not exists requests_swap_live_idx
  on public.requests (user_id, work_date, shift_id)
  where request_type = 'Đổi ca' and status = 'PENDING' and shift_id is not null;

-- ── 2. Who may take a ca (the "Đổi ca" picker) ───────────────────────────────────────────────
-- The eligibility rule is deliberately *not* restated: it asks `shift_conflict_reason()` — the function
-- the approval path also uses (SCRUM-23) — so "the list of names I can pick" and "the swap the manager
-- can approve" are the same rule, and a rule change is one edit instead of two.
--
--   * only `EMPLOYEE` accounts: a ca is covered by staff, never by a manager or the owner (SCRUM-63);
--   * only the caller's own branch (`users.branch_id`), which is also the tenant test — a branch
--     belongs to exactly one organization, so no `organization_id` clause is needed and a legacy
--     account whose `organization_id` was never filled is not hidden from its own branch;
--   * never the caller themselves, and never an account that has left (`is_active`).
--
-- `security definer` is required, not decoration: it reads `users` and `shift_assignments`, and the
-- caller is an `EMPLOYEE` whose RLS sees neither a colleague's profile row nor their schedule.
-- It answers about `auth.uid()` (`current_branch_id()`) and about one (date, ca) pair the caller
-- already knows, so a definer context leaks nothing new — but the EXECUTE grant must stay narrow:
-- without the `revoke`, any member could use it as an oracle over the roster.
create or replace function public.eligible_swap_targets(
  p_work_date date,
  p_shift_id uuid
)
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.full_name
  from public.users u
  where upper(coalesce(u.role, '')) = 'EMPLOYEE'
    and coalesce(u.is_active, true)
    and u.branch_id is not null
    and u.branch_id = public.current_branch_id()
    and u.id <> auth.uid()
    and public.shift_conflict_reason(u.id, p_work_date, p_shift_id) is null
  order by u.full_name;
$$;

comment on function public.eligible_swap_targets(date, uuid) is
  'SCRUM-82: the colleagues of the caller''s own branch who are free to take a ca on a day — the "Đổi ca" picker. EMPLOYEE only, never the caller, using public.shift_conflict_reason() as the one copy of the availability rule.';

revoke all on function public.eligible_swap_targets(date, uuid) from public;
grant execute on function public.eligible_swap_targets(date, uuid) to authenticated;

-- ============================================================================
-- Verification
-- ============================================================================

-- 1) The three columns, and the two foreign keys.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'requests'
  and column_name in ('work_date', 'shift_id', 'target_employee_id')
order by column_name;

select conname, pg_get_constraintdef(oid) as definition, convalidated
from pg_constraint
where conrelid = 'public.requests'::regclass
  and conname in ('requests_shift_id_fkey', 'requests_target_employee_id_fkey')
order by conname;

-- 2) The one-open-swap invariant.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'requests'
  and indexname = 'requests_swap_live_idx';

-- 3) The RPC is a definer function and is *not* callable by anon. `prosecdef` must be true and
--    `anon_can_execute` must be false; with the revoke in place only `authenticated` may call it.
select p.proname,
       p.prosecdef,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'eligible_swap_targets';

-- 4) What the picker answers. The SQL Editor has no session, so this returns nothing here — sign in as
--    an EMPLOYEE in the app and open /requests → "Đổi ca" to see the list, or call
--    GET /api/requests/swap-candidates?work_date=…&shift_id=… through /api-docs (which reuses your
--    browser cookie). Run this to check the rule by hand, replacing the two values:
--
-- select * from public.eligible_swap_targets('2026-10-20', '<shift uuid>');

-- ── After running this ──────────────────────────────────────────────────────────────────────
-- 1. `POST /api/requests` accepts `work_date` (and, for "Đổi ca", `shift_id` + `target_employee_id`).
-- 2. `GET /api/requests/swap-candidates` answers the picker list.
-- 3. Run `SCRUM-83_request_effects.sql` next: without it nothing acts on an approved đơn.


