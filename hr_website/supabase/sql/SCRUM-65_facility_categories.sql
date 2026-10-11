-- SCRUM-65: danh mục nhóm thiết bị theo từng tổ chức (public.facility_categories).
-- Run this script in Supabase Dashboard > SQL Editor.
--
-- Why this exists: SCRUM-45 pinned the categories into a CHECK constraint, and the API parser plus the
-- facilities screen repeated that same list, so "Nhóm thiết bị" could never grow without a deploy. This
-- script turns the list into data — the way SCRUM-58 did for the shift catalogue — so the facilities tab
-- can add a category itself: the six built-ins are seeded per organization, a new tenant is seeded by a
-- trigger, and `facilities.category` becomes a foreign key into the catalogue instead of a hard-coded
-- `in (...)`. Every statement is idempotent and none of them delete data.
--
-- Order matters: run it *before/with* the build that ships the "Thêm nhóm thiết bị" button (the app
-- degrades gracefully without it — the picker falls back to the built-in six — but a new category can
-- only be stored once the table exists).

-- ── 1. The catalogue ─────────────────────────────────────────────────────────────────────
create table if not exists public.facility_categories (
  id uuid primary key default gen_random_uuid(),
  -- The tenant. The default is what lets an insert from the app name no organization of its own; the
  -- RLS policy below repeats the same test.
  organization_id uuid not null
    references public.organizations (id) on delete cascade
    default public.current_organization_id(),
  -- What `facilities.category` stores: an uppercase token, never shown to an operator.
  code text not null,
  -- What the screen shows: "Khu pha chế", or whatever the owner typed for a category of their own.
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.facility_categories add column if not exists organization_id uuid;
alter table public.facility_categories add column if not exists code text;
alter table public.facility_categories add column if not exists name text;
alter table public.facility_categories add column if not exists created_at timestamptz not null default now();

-- The same two shapes `lib/domain/entities/Facility.ts` declares: `FACILITY_CATEGORY_CODE_PATTERN` and
-- `MAX_FACILITY_CATEGORY_NAME_LENGTH` (the API validates them first; the database is the boundary).
alter table public.facility_categories drop constraint if exists facility_categories_code_check;
alter table public.facility_categories add constraint facility_categories_code_check
  check (code ~ '^[A-Z0-9_]{1,60}$');

alter table public.facility_categories drop constraint if exists facility_categories_name_check;
alter table public.facility_categories add constraint facility_categories_name_check
  check (length(btrim(name)) between 1 and 60);

-- Unique *indexes* rather than inline constraints, so they can be re-created idempotently — and a unique
-- index is what the composite foreign key in step 4 requires.
create unique index if not exists facility_categories_organization_code_key
  on public.facility_categories (organization_id, code);

create unique index if not exists facility_categories_organization_name_key
  on public.facility_categories (organization_id, name);

-- ── 2. Every existing organization gets the six built-ins ────────────────────────────────
-- Guarded per (organization, code or name) so re-running only fills in what is missing. The names are
-- the ones the facilities screen has always shown (app/facilities/page.tsx `CATEGORY_LABELS`).
insert into public.facility_categories (organization_id, code, name)
select organization.id, seed.code, seed.name
from public.organizations organization
cross join (
  values
    ('KITCHEN',      'Khu pha chế'),
    ('COLD_STORAGE', 'Bảo quản lạnh'),
    ('FURNITURE',    'Nội thất'),
    ('ELECTRICAL',   'Thiết bị điện'),
    ('CLEANING',     'Vệ sinh'),
    ('OTHER',        'Khác')
) as seed(code, name)
where not exists (
  select 1
  from public.facility_categories existing
  where existing.organization_id = organization.id
    and (existing.code = seed.code or existing.name = seed.name)
);

-- ── 3. Adopt whatever `facilities.category` already holds ────────────────────────────────
-- Step 4 refuses any value that is not in the catalogue, so an unknown legacy code (or one written by
-- hand in the SQL Editor) is adopted here with its own code as the label — visible, and replaceable by
-- adding a better category later. Rows with no organization cannot be placed: `organization_id` is
-- nullable on `facilities`, a null in a composite foreign key is simply not enforced, and the verify
-- query at the end lists them.
insert into public.facility_categories (organization_id, code, name)
select distinct facility.organization_id, facility.category, facility.category
from public.facilities facility
where facility.organization_id is not null
  and not exists (
    select 1
    from public.facility_categories existing
    where existing.organization_id = facility.organization_id
      and (existing.code = facility.category or existing.name = facility.category)
  );

-- ── 4. `facilities.category` becomes a foreign key into the catalogue ────────────────────
-- This is what replaces `facilities_category_check`: the value must exist in *this organization's*
-- catalogue, so the CHECK could go (it only ever knew the six built-ins) without losing integrity.
alter table public.facilities drop constraint if exists facilities_category_check;
alter table public.facilities drop constraint if exists facilities_category_fkey;
alter table public.facilities add constraint facilities_category_fkey
  foreign key (organization_id, category)
  references public.facility_categories (organization_id, code);

-- ── 5. Every *future* organization gets the six built-ins too ────────────────────────────
-- Without this an organization created tomorrow starts with an empty picker again and somebody has to
-- remember this script. `security definer` is required: the trigger runs inside `create_organization`,
-- whose caller is a brand-new account that holds no role yet.
create or replace function public.seed_organization_facility_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.facility_categories (organization_id, code, name)
  values
    (new.id, 'KITCHEN',      'Khu pha chế'),
    (new.id, 'COLD_STORAGE', 'Bảo quản lạnh'),
    (new.id, 'FURNITURE',    'Nội thất'),
    (new.id, 'ELECTRICAL',   'Thiết bị điện'),
    (new.id, 'CLEANING',     'Vệ sinh'),
    (new.id, 'OTHER',        'Khác')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists organizations_seed_facility_categories on public.organizations;
create trigger organizations_seed_facility_categories
  after insert on public.organizations
  for each row
  execute function public.seed_organization_facility_categories();

-- ── 6. RLS ──────────────────────────────────────────────────────────────────────────────
alter table public.facility_categories enable row level security;

-- Read: every member of the organization, exactly like the inventory itself (SCRUM-53), because
-- `category` is a column of a facility row every member may read.
drop policy if exists facility_categories_select_authenticated on public.facility_categories;
create policy facility_categories_select_authenticated on public.facility_categories
  for select
  to authenticated
  using (organization_id = public.current_organization_id());

-- Extend: the two roles that hold `facility:manage` (SCRUM-59) — the owner and a manager. A category is
-- a catalogue of the whole organization rather than of one branch, so SCRUM-61's `heads_branch()` does
-- not apply here: a manager who heads no branch may still name a group ("Máy móc") for the inventory the
-- API lets them read. There is deliberately no UPDATE and no DELETE policy — renaming a `code` would
-- break the facilities that store it and deleting one would orphan them.
drop policy if exists facility_categories_insert_managers on public.facility_categories;
create policy facility_categories_insert_managers on public.facility_categories
  for insert
  to authenticated
  with check (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  );

-- ── Verify ──────────────────────────────────────────────────────────────────────────────
-- 1. One group per organization, six built-ins each (plus anything adopted in step 3).
select organization_id, count(*) as categories, string_agg(code, ', ' order by code) as codes
from public.facility_categories
group by organization_id
order by organization_id;

-- 2. Facility rows whose category has no catalogue row. Must be 0 — otherwise step 4 failed.
select count(*) as facilities_without_catalogue
from public.facilities facility
where facility.organization_id is not null
  and not exists (
    select 1
    from public.facility_categories existing
    where existing.organization_id = facility.organization_id
      and existing.code = facility.category
  );

-- 3. Facility rows outside every organization: the foreign key does not cover them (a null in a composite
--    key is not enforced). Assign them by hand on /facilities, or with an `update`, if it matters.
select count(*) as facilities_without_organization
from public.facilities
where organization_id is null;

-- 4. What a signed-in account sees. The SQL Editor has no session, so `current_organization_id()` is null
--    here and this returns nothing — check it in the app instead: open /facilities, press "Thêm thiết bị"
--    and the "Nhóm thiết bị" picker must list the six groups. GET /api/facility-categories (through
--    /api-docs, which reuses your browser cookie) is the same check.
select id, code, name
from public.facility_categories
where organization_id = public.current_organization_id()
order by name;
