-- SCRUM-97 — xử lý bất thường chấm công (A4 "Automated Timekeeping"): closing a derived exception
-- with who, when and why.
--
-- SCRUM-96 derives the exceptions (late, missing check-out, outside the geofence, unplanned work, a
-- different ca/branch than the plan, a late sync, an open complaint). None of that is stored, on
-- purpose: a derived fact cannot drift from the evidence. What *is* stored is the **decision** —
-- "somebody looked at this and this is the answer" is not derivable from a timesheet.
--
-- Kept separate from `verified_at` on purpose: verification says "the timesheet is right", a
-- resolution says "this anomaly was investigated and is settled". A row can be correct and still have
-- had an exception (a late arrival that was agreed), and a resolution must never rewrite the facts
-- payroll reads.
--
-- Applied by hand: Supabase Dashboard → SQL Editor, after SCRUM-96. Idempotent: safe to re-run.

-- ── 1. The decision ──────────────────────────────────────────────────────────────────────────
alter table public.attendance add column if not exists exception_status text;
alter table public.attendance add column if not exists exception_note text;
alter table public.attendance add column if not exists exception_resolved_by uuid
  references public.users (id);
alter table public.attendance add column if not exists exception_resolved_at timestamptz;

-- `null` = never raised (the normal state of a clean row), `OPEN` = re-opened after a resolution.
alter table public.attendance drop constraint if exists attendance_exception_status_check;
alter table public.attendance add constraint attendance_exception_status_check
  check (exception_status is null or exception_status in ('OPEN', 'RESOLVED')) not valid;

-- A resolution without an author and a reason is not auditable, so the trio must travel together.
-- `not valid` keeps a row written before this script from blocking the migration; new and updated
-- rows are checked.
alter table public.attendance drop constraint if exists attendance_exception_resolution_check;
alter table public.attendance add constraint attendance_exception_resolution_check
  check (
    exception_status is distinct from 'RESOLVED'
    or (
      exception_resolved_by is not null
      and exception_resolved_at is not null
      and length(btrim(coalesce(exception_note, ''))) > 0
    )
  ) not valid;

-- The queue filters on this column, so it gets its own index (the same shape as SCRUM-23's complaint).
create index if not exists attendance_exception_status_idx
  on public.attendance (exception_status);

-- ── 2. Only a manager may resolve ───────────────────────────────────────────────────────────
-- RLS lets an employee update their own row (completing the record), and `attendance_guard_self_update`
-- (SCRUM-21/59) only locks the check-in facts — so without this guard an employee could type their own
-- anomaly away. The manager half of the RLS split already limits a chi nhánh trưởng to the branches
-- they head (`attendance_update_managers` + `heads_branch`, SCRUM-61).
--
-- No session (SQL editor, service role) is left alone, like every other guard in this area.
create or replace function public.attendance_guard_exception_resolution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (
    new.exception_status is distinct from old.exception_status
    or new.exception_note is distinct from old.exception_note
    or new.exception_resolved_by is distinct from old.exception_resolved_by
    or new.exception_resolved_at is distinct from old.exception_resolved_at
  ) and not public.is_organization_manager() then
    raise exception 'Chỉ quản lý mới được xử lý bất thường chấm công.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists attendance_guard_exception_resolution on public.attendance;
create trigger attendance_guard_exception_resolution
  before update on public.attendance
  for each row execute function public.attendance_guard_exception_resolution();

-- ── 3. Tell the employee the outcome ───────────────────────────────────────────────────────
-- The actor is `exception_resolved_by`; `notify_user` never tells somebody about their own click, and
-- the employee is the recipient of a decision about their own timesheet (the same shape as
-- `COMPLAINT_RESOLVED` in SCRUM-71).
--
-- `to_regprocedure` guard: a project without SCRUM-70 has no `notify_user`, and a trigger that raises
-- on a missing function would roll the manager's save back with it (the SCRUM-73/74 lesson). The
-- notification is best-effort; the resolution is the fact.
create or replace function public.notify_attendance_exception_resolved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regprocedure(
    'public.notify_user(uuid, text, text, text, text, uuid, interval)'
  ) is null then
    return null;
  end if;

  if new.exception_status = 'RESOLVED'
     and old.exception_status is distinct from new.exception_status then
    perform public.notify_user(
      new.employee_id,
      'Bất thường chấm công đã được xử lý',
      format(
        '%s đã xử lý bất thường công ngày %s tại %s: %s',
        public.notification_actor_name(new.exception_resolved_by),
        public.notification_date_label(new.work_date),
        public.notification_branch_name(new.branch_id),
        btrim(coalesce(new.exception_note, ''))
      ),
      'ATTENDANCE_EXCEPTION_RESOLVED',
      'attendance',
      new.id
    );
  end if;

  return null;
end;
$$;

drop trigger if exists attendance_notify_exception_resolved on public.attendance;
create trigger attendance_notify_exception_resolved
  after update on public.attendance
  for each row execute function public.notify_attendance_exception_resolved();

-- ── 4. Verify ───────────────────────────────────────────────────────────────────────────────
-- 1. The four columns and their two constraints must exist. `convalidated = false` on the resolution
--    check is expected (`not valid`): legacy rows were not re-judged, new writes are.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'attendance'
  and column_name like 'exception\_%'
order by column_name;

select conname, convalidated, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.attendance'::regclass
  and conname in (
    'attendance_exception_status_check',
    'attendance_exception_resolution_check'
  );

-- 2. Both triggers installed exactly once, and their functions are `security definer` (a false value
--    would make the resolution trigger unable to read `users`/`branches` for the message).
select t.tgname, p.proname, p.prosecdef
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
where c.relname = 'attendance'
  and t.tgname in (
    'attendance_guard_exception_resolution',
    'attendance_notify_exception_resolved'
  );

-- 3. Run these through the app / PostgREST with a real JWT (the SQL editor has no `auth.uid()`):
--      a manager who heads the branch, PATCH → `RESOLVED` + a note  → 200, the row carries who/when
--      the same manager with a blank note                          → 400 (check constraint / use case)
--      an employee on their own row                                → 403 "Chỉ quản lý mới…"
--      a manager of another branch                                 → 404 (RLS matched no row)
--      after the save: the employee's bell shows
--        `Bất thường chấm công đã được xử lý` (type `ATTENDANCE_EXCEPTION_RESOLVED`)
--      re-open (`OPEN`)                                            → the note/author are cleared

