-- SCRUM-66: mã tài sản tự sinh cho public.facilities (dạng {MÃ_CHI_NHÁNH}-0001).
-- Run this script in Supabase Dashboard > SQL Editor.
--
-- Why this exists: `code` was a free-text field an operator typed by hand, so two facilities could carry
-- the same asset tag and no screen could tell which one a printed label belonged to. The app now derives
-- the code from the branch (`lib/usecases/facilityAssetCode.ts`: `branchAssetToken()` +
-- `nextFacilityAssetCode()`), and this script adds the boundary the generation relies on: one code per
-- code inside one organization.
--
-- What it deliberately does NOT do: no CHECK on the shape. A hand-typed code is the serial printed on the
-- device — the field has always documented itself as "mã tài sản / số serial" — so a `^[A-Z0-9_-]+$`
-- constraint would refuse a legitimate value, and no reformatting of existing rows is attempted. The
-- generated shape is validated by the API (`FACILITY_ASSET_CODE_PATTERN`), the uniqueness by the index.
--
-- Order matters: run it *before/with* the build that ships the auto-generated code. Without the index the
-- sequence still works (it counts what the caller can read), but two operators saving at the same moment
-- could write the same code.

-- ── 1. Duplicates to read before step 2 ─────────────────────────────────────────────────
-- Must be 0 rows. `create unique index` in step 2 fails and names the conflicting key otherwise; when it
-- does, keep the oldest row (`min(created_at)`) and clear or rename the others by hand.
select organization_id,
       code,
       count(*)             as duplicates,
       min(created_at)      as first_used,
       string_agg(name, ', ' order by created_at) as facilities
from public.facilities
where code is not null
group by organization_id, code
having count(*) > 1
order by duplicates desc, code;

-- ── 2. The boundary ─────────────────────────────────────────────────────────────────────
-- Partial, because `code` stays optional: a facility without a tag simply is not indexed. Two rows whose
-- `organization_id` is still null (rows written before SCRUM-53 filled the column) do not collide here —
-- PostgreSQL treats NULLs as distinct — so assigning them an organization is still up to an operator.
create unique index if not exists facilities_organization_code_key
  on public.facilities (organization_id, code)
  where code is not null;

-- ── 3. Backfill: what the form used to leave empty ──────────────────────────────────────
-- Reported, not filled: a generated code has to match the branch *and* continue that branch's highest
-- number, which is what `nextFacilityAssetCode()` does in the app. Open /facilities and save such a row —
-- the form sends an empty code and `UpdateFacilityUseCase` hands it the next one for its branch.
select facility.id,
       branch.name as branch_name,
       facility.name as facility_name
from public.facilities facility
left join public.branches branch on branch.id = facility.branch_id
where facility.code is null
order by branch.name, facility.name;

-- ── Verify ──────────────────────────────────────────────────────────────────────────────
-- 1. The index exists.
select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'facilities'
  and indexname = 'facilities_organization_code_key';

-- 2. One code per organization. Must be 0 rows once step 1 was clean — this is the query the repository's
--    `FacilityCodeConflictError` answer stands in for.
select organization_id, code, count(*) as duplicates
from public.facilities
where code is not null
group by organization_id, code
having count(*) > 1;

-- 3. What a signed-in account sees. The SQL Editor has no session, so `current_organization_id()` is null
--    here and this returns nothing — check it in the app instead: /facilities must list the codes, and
--    adding a facility to a branch must give `{MÃ_CHI_NHÁNH}-0001` (then `-0002`).
select facility.code, facility.name, branch.name as branch_name
from public.facilities facility
left join public.branches branch on branch.id = facility.branch_id
where facility.organization_id = public.current_organization_id()
order by facility.code nulls last, facility.name;
