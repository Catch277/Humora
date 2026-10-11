-- SCRUM-58: nạp danh mục ca làm việc (public.shifts) cho từng tổ chức.
-- Run this script in Supabase Dashboard > SQL Editor.
--
-- Why this exists: SCRUM-30 seeded the four standard templates ("Ca sáng", "Ca chiều", "Ca tối",
-- "Nghỉ") *before* `shifts` belonged to anybody, so they were written with `organization_id = null`.
-- SCRUM-53 then made the table tenant-scoped (`organization_id = public.current_organization_id()`
-- in the `shifts_select_authenticated` policy), which hides every row that belongs to no
-- organization — and nothing ever created templates for a *new* organization either. The result is
-- the empty "Ca làm việc" picker on /schedules: reading works, there is simply nothing to read.
-- All statements are idempotent and none of them delete data.

-- ── 1. Adopt the templates written before organizations existed ──────────────────────────
-- They can only be placed when the project has exactly one organization (the same reasoning as the
-- SCRUM-53 backfill): with two or more there is no way to tell whose they are, and step 2 gives each
-- organization its own copy instead. The rows left behind stay invisible under RLS; assign them by
-- hand with `update public.shifts set organization_id = '<uuid>' where organization_id is null` if
-- you know where they belong (the verify query at the end lists them).
update public.shifts
set organization_id = (
  select id from public.organizations order by created_at asc, id asc limit 1
)
where organization_id is null
  and (select count(*) from public.organizations) = 1;

-- ── 2. Every existing organization gets the standard catalogue ───────────────────────────
-- Guarded per (organization, name) so re-running only fills in what is missing: an organization that
-- already has "Ca sáng" keeps it and gets the other three.
insert into public.shifts (name, branch_id, start_time, end_time, organization_id)
select template.name, null, template.start_time::time, template.end_time::time, organization.id
from public.organizations organization
cross join (
  values
    ('Ca sáng',  '08:00', '17:00'),
    ('Ca chiều', '13:00', '22:00'),
    ('Ca tối',   '14:00', '23:00'),
    -- Zero-length window: "Nghỉ" is a day off (status LEAVE), not working hours, and the overlap rule
    -- in lib/usecases/shiftAssignmentInput.ts ignores it.
    ('Nghỉ',     '00:00', '00:00')
) as template(name, start_time, end_time)
where not exists (
  select 1
  from public.shifts existing
  where existing.organization_id = organization.id
    and existing.name = template.name
    and existing.branch_id is null
);

-- ── 3. Every *future* organization gets it too ───────────────────────────────────────────
-- Without this, an organization created tomorrow starts with an empty picker again and someone has to
-- remember this script. `security definer` is required: `shifts` has no INSERT policy at all (the
-- catalogue is not editable from the client), and the trigger runs inside `create_organization`,
-- whose caller may be a brand-new account.
create or replace function public.seed_organization_shift_catalogue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.shifts (name, start_time, end_time, organization_id)
  values
    ('Ca sáng',  '08:00', '17:00', new.id),
    ('Ca chiều', '13:00', '22:00', new.id),
    ('Ca tối',   '14:00', '23:00', new.id),
    ('Nghỉ',     '00:00', '00:00', new.id);

  return new;
end;
$$;

drop trigger if exists organizations_seed_shift_catalogue on public.organizations;
create trigger organizations_seed_shift_catalogue
  after insert on public.organizations
  for each row
  execute function public.seed_organization_shift_catalogue();

-- ── Verify ──────────────────────────────────────────────────────────────────────────────
-- 1. One row per organization (the templates the app will show); a null `organization_id` group is
--    what step 1 could not place.
select organization_id, count(*) as templates, string_agg(name, ', ' order by name) as names
from public.shifts
group by organization_id
order by organization_id;

-- 2. Rows still outside any organization. Must be 0 after step 1 ran on a single-organization project.
select count(*) as templates_without_organization
from public.shifts
where organization_id is null;

-- 3. What a signed-in account sees. The SQL Editor has no session, so `current_organization_id()` is
--    null here and this returns nothing — check it in the app instead: open /schedules, press "Xếp
--    ca" and the "Ca làm việc" picker must list Ca sáng / Ca chiều / Ca tối / Nghỉ.
--    GET /api/shifts (through /api-docs, which reuses your browser cookie) is the same check.
select id, name, start_time, end_time
from public.shifts
where organization_id = public.current_organization_id()
order by name;
