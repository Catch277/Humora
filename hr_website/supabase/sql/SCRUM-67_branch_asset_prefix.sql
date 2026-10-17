-- SCRUM-67: số thứ tự chi nhánh cho mã tài sản (public.branches.asset_prefix).
-- Run this script in Supabase Dashboard > SQL Editor.
--
-- Why this exists: SCRUM-66 derived the tag from the branch *name* alone, so "HUFLIT Sư Vạn Hạnh" and
-- "HUFLIT Sư Vạn Hồng" both reduced to `HSVH` and shared one number sequence. The codes stayed unique —
-- the number continues and `facilities_organization_code_key` is the boundary — but a code no longer said
-- which branch the device lives in. `asset_prefix` gives every branch a number of its own, handed out once
-- when the branch is created and never reused, so the tag becomes `01HSVH-0001` / `02HSVH-0001`.
--
-- Order matters: run it *before* the build that selects `branches.asset_prefix` (SCRUM-67's
-- `SupabaseBranchRepository`). Without the column every branch read answers `500 ... column
-- branches.asset_prefix does not exist`, and the branch list is what the revenue, schedule, staff,
-- attendance and facility screens all load — the same failure mode SCRUM-63's `users.branch_id` had.

-- ── 1. The column ───────────────────────────────────────────────────────────────────────
alter table public.branches add column if not exists asset_prefix smallint;

-- ── 2. Backfill: one number per branch, in creation order ───────────────────────────────
-- Deterministic and re-runnable: only the rows that are still empty are numbered, starting after the
-- highest number the organization already handed out, so a second run changes nothing. The order is
-- `created_at, id` so a tie between two branches created in the same second cannot depend on whatever
-- order the planner happens to return. A branch whose `organization_id` is still null (written before
-- SCRUM-53 filled the column) is numbered in a partition of its own.
with numbered as (
  select branch.id,
         coalesce(
           (
             select max(existing.asset_prefix)
             from public.branches existing
             where existing.organization_id = branch.organization_id
           ),
           0
         ) + row_number() over (
               partition by branch.organization_id
               order by branch.created_at, branch.id
             ) as assigned
  from public.branches branch
  where branch.asset_prefix is null
)
update public.branches
set asset_prefix = numbered.assigned
from numbered
where public.branches.id = numbered.id;

-- ── 3. One number per branch ────────────────────────────────────────────────────────────
alter table public.branches drop constraint if exists branches_asset_prefix_check;
alter table public.branches add constraint branches_asset_prefix_check
  check (asset_prefix is null or asset_prefix between 1 and 9999);

-- Partial, because a branch that predates this script (`null`) is still usable: its tags fall back to the
-- bare acronym, which is exactly how SCRUM-66 behaved for every branch.
create unique index if not exists branches_organization_asset_prefix_key
  on public.branches (organization_id, asset_prefix)
  where asset_prefix is not null;

-- ── 4. The tag itself stops being free text ─────────────────────────────────────────────
-- SCRUM-66 left the shape to the API on purpose: the column used to hold a serial an operator copied off
-- the device. The field is not editable any more, so new rows can be held to the generated shape
-- (`01HSVH-0001`). The branch number is optional in the pattern because a branch without one falls back to
-- the bare acronym (`HSVH-0001`), and this regex is the exact twin of `FACILITY_ASSET_CODE_PATTERN` in
-- lib/domain/entities/Facility.ts — change the two together.
--
-- `not valid` is what makes this safe: the existing rows are not scanned, so a legacy `DA_LAT-0001` or a
-- hand-typed serial keeps working, and the next edit re-tags it through the app
-- (`UpdateFacilityUseCase` generates a code whenever the stored one does not match).
alter table public.facilities drop constraint if exists facilities_code_check;
alter table public.facilities add constraint facilities_code_check
  check (code is null or code ~ '^[0-9]*[A-Z0-9]{1,6}-[0-9]{4,}$') not valid;

-- ── Verify ──────────────────────────────────────────────────────────────────────────────
-- 1. Every branch has a number, and no two branches of an organization share one. Both must be read.
select organization_id, asset_prefix, name
from public.branches
order by organization_id, asset_prefix;

select organization_id, asset_prefix, count(*) as duplicates
from public.branches
where asset_prefix is not null
group by organization_id, asset_prefix
having count(*) > 1;

-- 2. Both boundaries exist.
select tablename, indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'branches_organization_asset_prefix_key',
    'facilities_organization_code_key'
  )
order by tablename;

-- 3. What the next edit will re-tag (reported, never rewritten here). The SQL Editor has no session, so
--    this reads every organization; in the app the same query is scoped by RLS.
select facility.id,
       facility.code,
       branch.name as branch_name,
       facility.name as facility_name
from public.facilities facility
left join public.branches branch on branch.id = facility.branch_id
where facility.code is null
   or facility.code !~ '^[0-9]*[A-Z0-9]{1,6}-[0-9]{4,}$'
order by branch.name nulls last, facility.name;
