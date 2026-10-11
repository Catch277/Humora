-- SCRUM-23: Build DB — đăng ký làm việc, phân công làm việc, chuyển ca.
-- Run this script in Supabase Dashboard > SQL Editor, AFTER SCRUM-30, SCRUM-53, SCRUM-59, SCRUM-61
-- and SCRUM-63 (it uses their tables and the helper functions they created).
--
-- "Phân công làm việc" already exists: public.shift_assignments (SCRUM-30). This script adds the two
-- flows that were still missing around it:
--
--   * public.shift_registrations — an employee REGISTERS for a shift ("Tự đăng ký ca mở"). A manager
--     approves it, and approval creates the shift_assignments row in the same transaction.
--   * public.shift_swaps         — an employee hands one of their assigned shifts to a colleague
--     ("chuyển ca"): requester files → colleague accepts → manager approves, and approval moves the
--     shift_assignments row to the colleague in the same transaction.
--
-- Every state change goes through a `security definer` function that re-checks who the caller is.
-- The tables have no INSERT/UPDATE policy for the transitions on purpose: a policy cannot update two
-- tables atomically, and a client that could write `status = 'APPROVED'` directly would skip the
-- conflict checks. All statements are idempotent and none of them delete data.

do $$
begin
  if to_regclass('public.shift_assignments') is null or to_regclass('public.shifts') is null then
    raise exception 'SCRUM-23: run SCRUM-30_schedule.sql first (shifts, shift_assignments).';
  end if;

  if not exists (select 1 from pg_proc where proname = 'heads_branch')
    or not exists (select 1 from pg_proc where proname = 'current_branch_id') then
    raise exception 'SCRUM-23: run SCRUM-61_branch_scope.sql and SCRUM-63_employee_branch.sql first.';
  end if;
end $$;

-- ── 1. Shift registrations (đăng ký làm việc) ────────────────────────────────────────────
create table if not exists public.shift_registrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) default public.current_organization_id(),
  employee_id uuid not null references public.users (id) on delete cascade default auth.uid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  shift_id uuid not null references public.shifts (id),
  work_date date not null,
  status text not null default 'PENDING',
  note text,
  reviewed_by uuid references public.users (id),
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Values mirror SHIFT_REGISTRATION_STATUSES in lib/domain/entities/ShiftRegistration.ts.
alter table public.shift_registrations drop constraint if exists shift_registrations_status_check;
alter table public.shift_registrations add constraint shift_registrations_status_check
  check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'));

-- A decision without a reviewer is not auditable.
alter table public.shift_registrations drop constraint if exists shift_registrations_review_check;
alter table public.shift_registrations add constraint shift_registrations_review_check
  check (
    status in ('PENDING', 'CANCELLED')
    or (reviewed_by is not null and reviewed_at is not null)
  );

-- One live registration per person, per shift, per day. A REJECTED or CANCELLED one does not block
-- registering again.
create unique index if not exists shift_registrations_live_idx
  on public.shift_registrations (employee_id, work_date, shift_id)
  where status in ('PENDING', 'APPROVED');

create index if not exists shift_registrations_branch_date_idx
  on public.shift_registrations (branch_id, work_date);
create index if not exists shift_registrations_employee_date_idx
  on public.shift_registrations (employee_id, work_date);
create index if not exists shift_registrations_status_idx
  on public.shift_registrations (status);
create index if not exists shift_registrations_organization_idx
  on public.shift_registrations (organization_id);

alter table public.shift_registrations enable row level security;

-- Own rows, or a manager (same read model as SCRUM-60).
drop policy if exists shift_registrations_select on public.shift_registrations;
create policy shift_registrations_select
  on public.shift_registrations
  for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (
      employee_id = auth.uid()
      or public.is_organization_manager()
    )
  );

-- An employee registers for themselves, inside their own branch (SCRUM-63), always as PENDING.
drop policy if exists shift_registrations_insert_own on public.shift_registrations;
create policy shift_registrations_insert_own
  on public.shift_registrations
  for insert
  to authenticated
  with check (
    organization_id = public.current_organization_id()
    and employee_id = auth.uid()
    and branch_id = public.current_branch_id()
    and status = 'PENDING'
  );

-- The only direct update an employee gets: withdrawing their own PENDING registration.
drop policy if exists shift_registrations_cancel_own on public.shift_registrations;
create policy shift_registrations_cancel_own
  on public.shift_registrations
  for update
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and employee_id = auth.uid()
    and status = 'PENDING'
  )
  with check (
    organization_id = public.current_organization_id()
    and employee_id = auth.uid()
    and status = 'CANCELLED'
  );

-- ── 2. Shift swaps (chuyển ca) ───────────────────────────────────────────────────────────
create table if not exists public.shift_swaps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) default public.current_organization_id(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  -- The assignment being handed over. Approval re-points it at `target_employee_id`.
  assignment_id uuid not null references public.shift_assignments (id) on delete cascade,
  requester_id uuid not null references public.users (id) on delete cascade default auth.uid(),
  target_employee_id uuid not null references public.users (id) on delete cascade,
  reason text,
  status text not null default 'PENDING',
  target_responded_at timestamptz,
  reviewed_by uuid references public.users (id),
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_swaps_distinct_people_check check (requester_id <> target_employee_id)
);

-- PENDING   = waiting for the colleague
-- ACCEPTED  = the colleague agreed, waiting for the manager
-- APPROVED  = the manager approved and the assignment moved
-- REJECTED  = declined by the colleague or by the manager
-- CANCELLED = withdrawn by the requester
-- Values mirror SHIFT_SWAP_STATUSES in lib/domain/entities/ShiftSwap.ts.
alter table public.shift_swaps drop constraint if exists shift_swaps_status_check;
alter table public.shift_swaps add constraint shift_swaps_status_check
  check (status in ('PENDING', 'ACCEPTED', 'APPROVED', 'REJECTED', 'CANCELLED'));

-- One open swap per assignment: a shift cannot be promised to two colleagues at once.
create unique index if not exists shift_swaps_open_assignment_idx
  on public.shift_swaps (assignment_id)
  where status in ('PENDING', 'ACCEPTED');

create index if not exists shift_swaps_requester_idx on public.shift_swaps (requester_id);
create index if not exists shift_swaps_target_idx on public.shift_swaps (target_employee_id);
create index if not exists shift_swaps_branch_status_idx on public.shift_swaps (branch_id, status);
create index if not exists shift_swaps_organization_idx on public.shift_swaps (organization_id);

alter table public.shift_swaps enable row level security;

-- The two people involved, or a manager. Nobody writes to this table directly (see the functions
-- below), so there is deliberately no INSERT / UPDATE / DELETE policy.
drop policy if exists shift_swaps_select on public.shift_swaps;
create policy shift_swaps_select
  on public.shift_swaps
  for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (
      requester_id = auth.uid()
      or target_employee_id = auth.uid()
      or public.is_organization_manager()
    )
  );

-- ── 3. Conflict check shared by every function below ─────────────────────────────────────
-- Why a person cannot take a shift: they are on leave that day, already hold that template, or hold
-- another SCHEDULED shift whose hours overlap. A zero-length template ("Nghỉ", 00:00–00:00) never
-- overlaps anything, exactly like lib/usecases/shiftOverlap.ts. `p_ignore_assignment` lets the swap
-- approval ignore the very assignment that is being moved.
create or replace function public.shift_conflict_reason(
  p_employee_id uuid,
  p_work_date date,
  p_shift_id uuid,
  p_ignore_assignment uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start time;
  v_end time;
begin
  select s.start_time, s.end_time into v_start, v_end
  from public.shifts s
  where s.id = p_shift_id;

  if exists (
    select 1
    from public.shift_assignments a
    where a.employee_id = p_employee_id
      and a.work_date = p_work_date
      and a.status = 'LEAVE'
      and a.id is distinct from p_ignore_assignment
  ) then
    return 'The employee is on leave that day.';
  end if;

  if exists (
    select 1
    from public.shift_assignments a
    where a.employee_id = p_employee_id
      and a.work_date = p_work_date
      and a.shift_id = p_shift_id
      and a.status <> 'CANCELLED'
      and a.id is distinct from p_ignore_assignment
  ) then
    return 'The employee already holds this shift that day.';
  end if;

  if v_start is not null and v_end is not null and v_start <> v_end and exists (
    select 1
    from public.shift_assignments a
    join public.shifts s on s.id = a.shift_id
    where a.employee_id = p_employee_id
      and a.work_date = p_work_date
      and a.status = 'SCHEDULED'
      and a.id is distinct from p_ignore_assignment
      and s.start_time is not null
      and s.end_time is not null
      and s.start_time <> s.end_time
      and s.start_time < v_end
      and s.end_time > v_start
  ) then
    return 'The employee already has a shift that overlaps these hours.';
  end if;

  return null;
end;
$$;

revoke all on function public.shift_conflict_reason(uuid, date, uuid, uuid) from public;

-- ── 4. Review a registration: approve = create the assignment ────────────────────────────
-- Error codes the API layer maps: 28000 = no session, P0002 = not found, 42501 = not allowed,
-- 22023 = wrong state / bad input, 23P01 = conflict with the existing schedule.
create or replace function public.review_shift_registration(
  p_registration_id uuid,
  p_approve boolean,
  p_reject_reason text default null
)
returns public.shift_registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.shift_registrations;
  v_conflict text;
begin
  if v_uid is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select * into v_row
  from public.shift_registrations
  where id = p_registration_id
    and organization_id = public.current_organization_id()
  for update;

  if not found then
    raise exception 'Shift registration not found.' using errcode = 'P0002';
  end if;

  if not (public.is_organization_owner() or public.heads_branch(v_row.branch_id)) then
    raise exception 'Only the owner or the head of this branch may review a registration.'
      using errcode = '42501';
  end if;

  if v_row.status <> 'PENDING' then
    raise exception 'Only a pending registration can be reviewed.' using errcode = '22023';
  end if;

  if p_approve then
    v_conflict := public.shift_conflict_reason(v_row.employee_id, v_row.work_date, v_row.shift_id);

    if v_conflict is not null then
      raise exception '%', v_conflict using errcode = '23P01';
    end if;

    insert into public.shift_assignments
      (employee_id, branch_id, shift_id, work_date, status, note, created_by, organization_id)
    values
      (v_row.employee_id, v_row.branch_id, v_row.shift_id, v_row.work_date, 'SCHEDULED',
       v_row.note, v_uid, v_row.organization_id);
  elsif p_reject_reason is null or length(btrim(p_reject_reason)) = 0 then
    raise exception 'A reason is required to reject a registration.' using errcode = '22023';
  end if;

  update public.shift_registrations
  set status = case when p_approve then 'APPROVED' else 'REJECTED' end,
      reject_reason = case when p_approve then null else btrim(p_reject_reason) end,
      reviewed_by = v_uid,
      reviewed_at = now(),
      updated_at = now()
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

-- ── 5. Swaps: request → respond → review (+ cancel) ──────────────────────────────────────
create or replace function public.request_shift_swap(
  p_assignment_id uuid,
  p_target_employee_id uuid,
  p_reason text default null
)
returns public.shift_swaps
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.shift_assignments;
  v_target public.users;
  v_conflict text;
  v_row public.shift_swaps;
begin
  if v_uid is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select * into v_assignment
  from public.shift_assignments
  where id = p_assignment_id
    and organization_id = public.current_organization_id();

  -- Somebody else's shift looks exactly like a missing one.
  if not found or v_assignment.employee_id <> v_uid then
    raise exception 'Shift assignment not found.' using errcode = 'P0002';
  end if;

  if v_assignment.status <> 'SCHEDULED' then
    raise exception 'Only a scheduled shift can be handed over.' using errcode = '22023';
  end if;

  if v_assignment.work_date < (now() at time zone 'Asia/Bangkok')::date then
    raise exception 'A shift in the past cannot be handed over.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.attendance t
    where t.employee_id = v_uid
      and t.work_date = v_assignment.work_date
      and t.shift_id = v_assignment.shift_id
  ) then
    raise exception 'This shift already has an attendance record.' using errcode = '22023';
  end if;

  select * into v_target
  from public.users
  where id = p_target_employee_id;

  if not found
    or p_target_employee_id = v_uid
    or v_target.organization_id is distinct from v_assignment.organization_id
    or v_target.branch_id is distinct from v_assignment.branch_id
    or coalesce(v_target.is_active, true) = false
    or upper(coalesce(v_target.role, '')) <> 'EMPLOYEE'
  then
    raise exception 'The colleague must be another active employee of the same branch.'
      using errcode = '22023';
  end if;

  v_conflict := public.shift_conflict_reason(
    p_target_employee_id, v_assignment.work_date, v_assignment.shift_id
  );

  if v_conflict is not null then
    raise exception '%', v_conflict using errcode = '23P01';
  end if;

  begin
    insert into public.shift_swaps
      (organization_id, branch_id, assignment_id, requester_id, target_employee_id, reason)
    values
      (v_assignment.organization_id, v_assignment.branch_id, v_assignment.id, v_uid,
       p_target_employee_id, nullif(btrim(coalesce(p_reason, '')), ''))
    returning * into v_row;
  exception when unique_violation then
    raise exception 'This shift already has an open swap request.' using errcode = '23P01';
  end;

  return v_row;
end;
$$;

-- The colleague answers. Accepting moves it on to the manager; declining ends it.
create or replace function public.respond_shift_swap(
  p_swap_id uuid,
  p_accept boolean
)
returns public.shift_swaps
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.shift_swaps;
begin
  if v_uid is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select * into v_row
  from public.shift_swaps
  where id = p_swap_id
    and organization_id = public.current_organization_id()
  for update;

  if not found or v_row.target_employee_id <> v_uid then
    raise exception 'Shift swap not found.' using errcode = 'P0002';
  end if;

  if v_row.status <> 'PENDING' then
    raise exception 'Only a pending swap can be answered.' using errcode = '22023';
  end if;

  update public.shift_swaps
  set status = case when p_accept then 'ACCEPTED' else 'REJECTED' end,
      target_responded_at = now(),
      reject_reason = case when p_accept then null else 'Đồng nghiệp từ chối nhận ca.' end,
      updated_at = now()
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

-- The requester withdraws it while it is still open.
create or replace function public.cancel_shift_swap(p_swap_id uuid)
returns public.shift_swaps
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.shift_swaps;
begin
  if v_uid is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select * into v_row
  from public.shift_swaps
  where id = p_swap_id
    and organization_id = public.current_organization_id()
  for update;

  if not found or v_row.requester_id <> v_uid then
    raise exception 'Shift swap not found.' using errcode = 'P0002';
  end if;

  if v_row.status not in ('PENDING', 'ACCEPTED') then
    raise exception 'Only an open swap can be cancelled.' using errcode = '22023';
  end if;

  update public.shift_swaps
  set status = 'CANCELLED', updated_at = now()
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

-- The manager decides an ACCEPTED swap. Approval moves the assignment to the colleague.
create or replace function public.review_shift_swap(
  p_swap_id uuid,
  p_approve boolean,
  p_reject_reason text default null
)
returns public.shift_swaps
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.shift_swaps;
  v_assignment public.shift_assignments;
  v_conflict text;
begin
  if v_uid is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select * into v_row
  from public.shift_swaps
  where id = p_swap_id
    and organization_id = public.current_organization_id()
  for update;

  if not found then
    raise exception 'Shift swap not found.' using errcode = 'P0002';
  end if;

  if not (public.is_organization_owner() or public.heads_branch(v_row.branch_id)) then
    raise exception 'Only the owner or the head of this branch may review a swap.'
      using errcode = '42501';
  end if;

  if v_row.status <> 'ACCEPTED' then
    raise exception 'Only a swap accepted by the colleague can be reviewed.' using errcode = '22023';
  end if;

  if p_approve then
    select * into v_assignment
    from public.shift_assignments
    where id = v_row.assignment_id
    for update;

    -- The schedule may have changed since the request was filed.
    if not found
      or v_assignment.employee_id <> v_row.requester_id
      or v_assignment.status <> 'SCHEDULED'
    then
      raise exception 'The shift is no longer assigned to the requester.' using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.attendance t
      where t.employee_id = v_assignment.employee_id
        and t.work_date = v_assignment.work_date
        and t.shift_id = v_assignment.shift_id
    ) then
      raise exception 'This shift already has an attendance record.' using errcode = '22023';
    end if;

    v_conflict := public.shift_conflict_reason(
      v_row.target_employee_id, v_assignment.work_date, v_assignment.shift_id, v_assignment.id
    );

    if v_conflict is not null then
      raise exception '%', v_conflict using errcode = '23P01';
    end if;

    update public.shift_assignments
    set employee_id = v_row.target_employee_id,
        updated_at = now()
    where id = v_assignment.id;
  elsif p_reject_reason is null or length(btrim(p_reject_reason)) = 0 then
    raise exception 'A reason is required to reject a swap.' using errcode = '22023';
  end if;

  update public.shift_swaps
  set status = case when p_approve then 'APPROVED' else 'REJECTED' end,
      reject_reason = case when p_approve then null else btrim(p_reject_reason) end,
      reviewed_by = v_uid,
      reviewed_at = now(),
      updated_at = now()
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

-- Only signed-in accounts may call the transitions; each function still checks who they are.
revoke all on function public.review_shift_registration(uuid, boolean, text) from public;
revoke all on function public.request_shift_swap(uuid, uuid, text) from public;
revoke all on function public.respond_shift_swap(uuid, boolean) from public;
revoke all on function public.cancel_shift_swap(uuid) from public;
revoke all on function public.review_shift_swap(uuid, boolean, text) from public;

grant execute on function public.review_shift_registration(uuid, boolean, text) to authenticated;
grant execute on function public.request_shift_swap(uuid, uuid, text) to authenticated;
grant execute on function public.respond_shift_swap(uuid, boolean) to authenticated;
grant execute on function public.cancel_shift_swap(uuid) to authenticated;
grant execute on function public.review_shift_swap(uuid, boolean, text) to authenticated;

-- ── Verify ───────────────────────────────────────────────────────────────────────────────
-- Both tables must exist with RLS on, and the five functions must be listed.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('shift_registrations', 'shift_swaps');

select proname
from pg_proc
where proname in (
  'review_shift_registration', 'request_shift_swap', 'respond_shift_swap',
  'cancel_shift_swap', 'review_shift_swap', 'shift_conflict_reason'
)
order by proname;