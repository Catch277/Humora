-- ============================================================================
-- SCRUM-85 — retire the legacy “Ca tối” (14:00–23:00)
-- ============================================================================
--
-- Why this script exists
--   The timetable is fixed (SCRUM-84): Ca sáng 08:30–12:30, Ca chiều 13:30–17:30, Tăng ca 18:00–22:00,
--   with the pauses 12:30–13:30 and 17:30–18:00 drawn by `/schedules` from the gaps between two ca
--   (`withRestRows`). The legacy `Ca tối` 14:00–23:00 breaks that drawing while it is still in the ordered
--   catalogue: 17:30 is not before its 14:00 start, and it ends after `Tăng ca` begins — so no
--   17:30–18:00 pause can be produced until the row stops taking part in the week.
--
-- Why it is retired and not deleted
--   `SCRUM-84` already tries the delete, and only removes a template nothing references. The four tables
--   that can point at a shift are why that guard exists:
--     * `shift_assignments.shift_id`     not null            → the delete is refused;
--     * `shift_registrations.shift_id`   not null            → the delete is refused;
--     * `attendance.shift_id`            on delete set null  → history silently loses its ca;
--     * `requests.shift_id`              on delete set null  → an approved đơn loses the ca it named.
--   A past schedule is the record of what people actually worked; losing it to tidy a picker is not a
--   trade this project makes (the same reasoning as `branches_guard_delete`, SCRUM-61). So `shifts` gains
--   an `is_active` flag, `Ca tối` becomes inactive, and everything that builds a catalogue leaves it out:
--   `ListShiftsUseCase` → `GET /api/shifts` → the week table and every ca picker on `/schedules` and
--   `/check-in`. A week that already holds a `Ca tối` assignment still renders it, because the assignment
--   embeds its own template.
--
-- What this script does
--   1. adds `public.shifts.is_active` (default true, so every existing template stays active);
--   2. prints what still points at `Ca tối` — read it before and after;
--   3. retires the organization-wide `Ca tối` rows (`branch_id is null`, which is how SCRUM-30/84 seed);
--   4. prints every assignment from today (Asia/Bangkok) onward that sits on a retired template: the
--      screen no longer offers that ca, so those are the rows to re-point by hand;
--   5. leaves a commented, opt-in hard delete for a project that accepts losing the reference rows.
--
-- Prerequisites: SCRUM-21 (attendance), SCRUM-23 (registrations), SCRUM-30 (`shifts`), SCRUM-41
-- (`requests`), SCRUM-53 (`shifts.organization_id`), SCRUM-58 and SCRUM-84 (the catalogue). Idempotent:
-- a second run changes nothing.
--
-- Apply by hand: Supabase Dashboard → SQL Editor → paste → Run.

-- ── 0. Fail with a sentence instead of `42703` on a half-applied database ──────────────────
do $$
begin
  if to_regclass('public.shifts') is null then
    raise exception 'SCRUM-85: run SCRUM-30_schedule.sql and SCRUM-58_shift_catalogue.sql first — public.shifts is missing.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'shifts' and column_name = 'organization_id'
  ) then
    raise exception 'SCRUM-85: run SCRUM-53_tenant_scope.sql and SCRUM-58_shift_catalogue.sql first — shifts.organization_id is missing.';
  end if;

  if to_regclass('public.shift_assignments') is null
     or to_regclass('public.shift_registrations') is null
     or to_regclass('public.attendance') is null
     or to_regclass('public.requests') is null then
    raise exception 'SCRUM-85: run SCRUM-21_attendance.sql, SCRUM-23_shift_registration_swap.sql, SCRUM-30_schedule.sql and SCRUM-41_request_review.sql first — the tables the reports below read are missing.';
  end if;
end
$$;

-- ── 1. The flag ───────────────────────────────────────────────────────────────────────────────
-- Default true on purpose: every template that already exists keeps working, and only the row named in
-- §3 is retired. The column is read with a fallback in `SupabaseShiftRepository` (PostgREST `42703`), and
-- that fallback also marks the legacy `Ca tối` inactive by name — so a build that ships before this script
-- already hides the row and draws the 17:30–18:00 pause. Applying the script makes the flag the authority
-- (and keeps the history link, which a delete would not).
alter table public.shifts add column if not exists is_active boolean not null default true;

comment on column public.shifts.is_active is
  'SCRUM-85: false = retired template. GET /api/shifts and the ca pickers leave it out, while the assignments and registrations that already point at it keep their link, so a past week still renders the ca that was worked.';


-- ── 2. Who still points at “Ca tối” (read it) ─────────────────────────────────────────────────
-- Same shape as SCRUM-84 verify 2, so the two scripts answer the same question the same way. Nothing is
-- modified here; run it again after §3 and expect the same counts with `is_active = false`.
select template.organization_id,
       template.id,
       template.is_active,
       (select count(*) from public.shift_assignments a where a.shift_id = template.id)   as assignments,
       (select count(*) from public.shift_registrations r where r.shift_id = template.id)  as registrations,
       (select count(*) from public.attendance t where t.shift_id = template.id)           as attendance_rows,
       (select count(*) from public.requests q where q.shift_id = template.id)             as requests
from public.shifts template
where template.name = 'Ca tối'
  and template.branch_id is null
order by template.organization_id;

-- ── 3. Retire it ──────────────────────────────────────────────────────────────────────────────
-- `is_active = true` in the filter keeps a re-run from bumping `updated_at` on a row already retired.
update public.shifts
set is_active = false,
    updated_at = now()
where name = 'Ca tối'
  and branch_id is null
  and is_active;

-- ── 4. Future work still sitting on a retired template ───────────────────────────────────────
-- The timetable no longer offers that ca, so these rows cannot be reached from `/schedules` any more.
-- A past `work_date` is left alone on purpose: it is history. A row listed here is reassigned by hand
-- (Sửa ca on `/schedules`, or an SQL update to a current template) — never deleted blind.
select template.name as ca,
       template.organization_id,
       a.id as assignment_id,
       u.full_name,
       to_char(a.work_date, 'DD/MM/YYYY') as ngay,
       a.status
from public.shift_assignments a
join public.shifts template on template.id = a.shift_id
left join public.users u on u.id = a.employee_id
where not template.is_active
  and a.work_date >= (now() at time zone 'Asia/Bangkok')::date
order by a.work_date, template.name, u.full_name;

-- ── 5. Optional: hard delete, only if you accept losing the history above ────────────────────
-- Uncomment and run *only* in a project where §2 reports nothing worth keeping. The order matters: the
-- two `not null` foreign keys have to be cleared before the template can go, and the two `set null` ones
-- are cleared by the delete itself. There is no way back after the `commit`.
--
-- begin;
--   delete from public.shift_registrations where shift_id in (
--     select id from public.shifts where name = 'Ca tối' and branch_id is null
--   );
--   delete from public.shift_assignments where shift_id in (
--     select id from public.shifts where name = 'Ca tối' and branch_id is null
--   );
--   delete from public.shifts where name = 'Ca tối' and branch_id is null;
-- commit;

-- ============================================================================
-- Verification
-- ============================================================================

-- 1) The catalogue per organization, with the flag. Expect three active working ca (Ca sáng 08:30–12:30,
--    Ca chiều 13:30–17:30, Tăng ca 18:00–22:00), `Nghỉ` 00:00–00:00 still active (SCRUM-83 looks it up by
--    name for legacy rows), and `Ca tối` — if the row exists at all — inactive.
select organization_id,
       is_active,
       string_agg(
         name || ' ' || coalesce(left(start_time::text, 5), '--:--')
              || '–' || coalesce(left(end_time::text, 5), '--:--'),
         ', ' order by start_time nulls last, name
       ) as timetable
from public.shifts
where branch_id is null
group by organization_id, is_active
order by organization_id, is_active desc;

-- 2) The pauses `/schedules` will draw, computed exactly like `withRestRows`: consecutive *active*
--    working templates only, a pause where one ends before the next starts. Expect two rows per
--    organization — 12:30–13:30 and 17:30–18:00. Read-only.
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
    and is_active
    and start_time is not null
    and end_time is not null
    and start_time <> end_time
) gaps
where next_name is not null
  and previous_end < next_start
order by organization_id, previous_end;

-- ── After running this ──────────────────────────────────────────────────────────────────────
-- 1. Nothing to restart: every request reads the table afresh, and the app reads the flag with a fallback.
-- 2. `/schedules` shows Ca sáng / Nghỉ giữa ca 12:30–13:30 / Ca chiều / Nghỉ giữa ca 17:30–18:00 /
--    Tăng ca, and no `Ca tối` — neither as a row nor in the “Ca làm việc” picker.
-- 3. A week that already holds a `Ca tối` assignment keeps its row, because the assignment embeds the
--    template; §4 lists any of those still in the future.

