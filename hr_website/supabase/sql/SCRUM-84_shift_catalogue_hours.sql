-- ============================================================================
-- SCRUM-84 — lịch cố định: Ca sáng 08:30–12:30, Ca chiều 13:30–17:30, Tăng ca 18:00–22:00
-- ============================================================================
--
-- What changes and why
--   The schedule became a fixed day: Ca sáng 08:30–12:30, a break 12:30–13:30, Ca chiều 13:30–17:30, a
--   break 17:30–18:00, Tăng ca 18:00–22:00. `/schedules` draws the two breaks itself, from the gap
--   between one ca's end and the next ca's start (`withRestRows` in app/schedules/page.tsx), so **no
--   break is a row here**: a `public.shifts` row would appear in the "Ca làm việc" picker and could be
--   assigned like work, and the overlap rule (`lib/usecases/shiftAssignmentInput.ts`) would have to
--   learn about it. The catalogue therefore only needs the three working windows, and "Nghỉ" keeps
--   its meaning — the zero-length **day off** template (status LEAVE, and SCRUM-83's approved
--   "Nghỉ phép"). It is not a break and must not be renamed into one.
--
-- What this script does
--   1. sets Ca sáng to 08:30–12:30 and Ca chiều to 13:30–17:30 (organization-wide templates only:
--      `branch_id is null`, which is what SCRUM-30/58 seed);
--   2. adds "Tăng ca" 18:00–22:00 for every organization that does not have it yet;
--   3. retires the legacy "Ca tối" (14:00–23:00), but **only where nothing references it**. A delete
--      would either fail on a foreign key (`shift_assignments`, `shift_registrations`) or, worse,
--      silently unlink history (`attendance.shift_id` and `requests.shift_id` are `on delete set null`),
--      so a row that is still used is left alone and reported by verify query 2;
--   4. replaces `seed_organization_shift_catalogue()` so an organization created from now on starts
--      with this timetable.
--
-- Read before running
--   * A template is not versioned: changing `start_time`/`end_time` also reinterprets the assignments
--     and attendance rows that already point at it (`attendanceAutoClose` reads the ca's end, the LATE
--     verdict re-derives from its start). That is inherent to editing a catalogue row; the alternative
--     is a second template plus leaving the old one in place, which the week table would then show as
--     an extra row.
--   * Prerequisites: SCRUM-21 (attendance), SCRUM-23 (registrations), SCRUM-30 (`shifts`),
--     SCRUM-53 (`shifts.organization_id`), SCRUM-58 (the seed) and SCRUM-82 (`requests.shift_id`).
--   * Run this **after** SCRUM-58, and run it again if SCRUM-58 is ever re-applied: that script
--     restates the old function and would seed "Ca tối" for a new organization.
--   * Idempotent: every statement can be re-run, and the delete only ever removes an unused row.
--
-- Apply by hand: Supabase Dashboard → SQL Editor → paste → Run.

-- ── 0. Fail with a sentence instead of `42703` on a half-applied database ──────────────────
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'shifts' and column_name = 'organization_id'
  ) then
    raise exception 'SCRUM-84: run SCRUM-53_tenant_scope.sql and SCRUM-58_shift_catalogue.sql first — shifts.organization_id is missing.';
  end if;

  if to_regclass('public.shift_registrations') is null then
    raise exception 'SCRUM-84: run SCRUM-23_shift_registration_swap.sql first — public.shift_registrations is missing.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'requests' and column_name = 'shift_id'
  ) then
    raise exception 'SCRUM-84: run SCRUM-82_request_shift_details.sql first — requests.shift_id is missing.';
  end if;
end
$$;

-- ── 1. The two daytime windows ──────────────────────────────────────────────────────────────
-- `is distinct from` keeps a re-run from bumping `updated_at` on a row that is already correct.
update public.shifts
set start_time = '08:30', end_time = '12:30', updated_at = now()
where name = 'Ca sáng'
  and branch_id is null
  and (start_time is distinct from '08:30' or end_time is distinct from '12:30');

update public.shifts
set start_time = '13:30', end_time = '17:30', updated_at = now()
where name = 'Ca chiều'
  and branch_id is null
  and (start_time is distinct from '13:30' or end_time is distinct from '17:30');

-- ── 2. Tăng ca 18:00–22:00 ──────────────────────────────────────────────────────────────────
-- Guarded per (organization, name) like SCRUM-58 §2, so an organization that already has it keeps a
-- single row; the update after it only pins the hours of a row that was created by hand.
insert into public.shifts (name, branch_id, start_time, end_time, organization_id)
select 'Tăng ca', null, '18:00'::time, '22:00'::time, organization.id
from public.organizations organization
where not exists (
  select 1
  from public.shifts existing
  where existing.organization_id = organization.id
    and existing.name = 'Tăng ca'
    and existing.branch_id is null
);

update public.shifts
set start_time = '18:00', end_time = '22:00', updated_at = now()
where name = 'Tăng ca'
  and branch_id is null
  and (start_time is distinct from '18:00' or end_time is distinct from '22:00');

-- ── 3. Retire the unused legacy "Ca tối" ────────────────────────────────────────────────────
-- Every guard is a table that can point at a template: two of them would refuse the delete
-- (`shift_assignments`, `shift_registrations`), the other two would silently lose the link. A row with
-- any reference stays, and verify query 2 prints what it still holds.
delete from public.shifts target
where target.name = 'Ca tối'
  and target.branch_id is null
  and not exists (select 1 from public.shift_assignments a where a.shift_id = target.id)
  and not exists (select 1 from public.shift_registrations r where r.shift_id = target.id)
  and not exists (select 1 from public.attendance t where t.shift_id = target.id)
  and not exists (select 1 from public.requests q where q.shift_id = target.id);

-- ── 4. Every *future* organization starts with this timetable ───────────────────────────────
-- `security definer` is required for the same reason as SCRUM-58 §3: `shifts` has no INSERT policy
-- (nothing in the app can write the catalogue), and the trigger runs inside `create_organization`.
create or replace function public.seed_organization_shift_catalogue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.shifts (name, start_time, end_time, organization_id)
  values
    ('Ca sáng',  '08:30', '12:30', new.id),
    ('Ca chiều', '13:30', '17:30', new.id),
    ('Tăng ca',  '18:00', '22:00', new.id),
    -- Zero-length window: "Nghỉ" is a day off (status LEAVE), not working hours. The two breaks of the
    -- fixed timetable are drawn by /schedules from the gaps, so they are deliberately absent here.
    ('Nghỉ',     '00:00', '00:00', new.id);

  return new;
end;
$$;

drop trigger if exists organizations_seed_shift_catalogue on public.organizations;
create trigger organizations_seed_shift_catalogue
  after insert on public.organizations
  for each row
  execute function public.seed_organization_shift_catalogue();

-- ── Verify ─────────────────────────────────────────────────────────────────────────────────
-- 1. The catalogue per organization. Expect Ca sáng 08:30–12:30, Ca chiều 13:30–17:30,
--    Tăng ca 18:00–22:00 and Nghỉ 00:00–00:00 (plus any branch-specific template).
select organization_id,
       count(*) as templates,
       string_agg(
         name || ' ' || coalesce(left(start_time::text, 5), '--:--')
              || '–' || coalesce(left(end_time::text, 5), '--:--'),
         ', ' order by start_time nulls last, name
       ) as timetable
from public.shifts
group by organization_id
order by organization_id;

-- 2. "Ca tối" rows that survived step 3 because something still uses them. An empty result is the
--    expected end state; a row here is history to reassign by hand, never to delete blind.
select template.id,
       template.organization_id,
       (select count(*) from public.shift_assignments a where a.shift_id = template.id)   as assignments,
       (select count(*) from public.shift_registrations r where r.shift_id = template.id)  as registrations,
       (select count(*) from public.attendance t where t.shift_id = template.id)           as attendance_rows,
       (select count(*) from public.requests q where q.shift_id = template.id)             as requests
from public.shifts template
where template.name = 'Ca tối'
  and template.branch_id is null
order by template.organization_id;

-- 3. The breaks /schedules will draw: every gap between two consecutive working templates, computed
--    exactly like `withRestRows` (zero-length "Nghỉ" and an overlap excluded). On the standard
--    catalogue this answers two rows per organization — 12:30–13:30 and 17:30–18:00. Read-only.
select organization_id,
       previous_name as after_ca,
       left(previous_end::text, 5) || '–' || left(next_start::text, 5) as break_window,
       next_name as before_ca
from (
  select organization_id,
         name as previous_name,
         end_time as previous_end,
         lead(name) over (partition by organization_id order by start_time, name) as next_name,
         lead(start_time) over (partition by organization_id order by start_time, name) as next_start
  from public.shifts
  where branch_id is null
    and start_time is not null
    and end_time is not null
    and start_time <> end_time
) gaps
where next_name is not null
  and previous_end < next_start
order by organization_id, previous_end;
