-- SCRUM-45: Cơ sở vật chất theo từng chi nhánh (facilities registry + maintenance states).
-- Run this script in Supabase Dashboard > SQL Editor.
--
-- Every statement is idempotent: the table is created when missing and columns/constraints
-- are (re)applied on top, so the script can be re-run after a partial failure.
-- SCRUM-46 (bảo trì / sửa chữa) reads the `condition` values defined here.

create table if not exists public.facilities (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  name text not null,
  code text,
  category text not null default 'OTHER',
  quantity integer not null default 1,
  condition text not null default 'GOOD',
  last_checked_at date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.facilities add column if not exists branch_id uuid;
alter table public.facilities add column if not exists name text;
alter table public.facilities add column if not exists code text;
alter table public.facilities add column if not exists category text not null default 'OTHER';
alter table public.facilities add column if not exists quantity integer not null default 1;
alter table public.facilities add column if not exists condition text not null default 'GOOD';
alter table public.facilities add column if not exists last_checked_at date;
alter table public.facilities add column if not exists note text;
alter table public.facilities add column if not exists created_at timestamptz not null default now();
alter table public.facilities add column if not exists updated_at timestamptz not null default now();

-- Values mirror FACILITY_CATEGORIES / FACILITY_CONDITIONS in lib/domain/entities/Facility.ts
-- and the option lists in app/facilities/page.tsx.
alter table public.facilities drop constraint if exists facilities_category_check;
alter table public.facilities add constraint facilities_category_check
  check (category in ('KITCHEN', 'COLD_STORAGE', 'FURNITURE', 'ELECTRICAL', 'CLEANING', 'OTHER'));

alter table public.facilities drop constraint if exists facilities_condition_check;
alter table public.facilities add constraint facilities_condition_check
  check (condition in ('GOOD', 'FAIR', 'MAINTENANCE', 'BROKEN'));

alter table public.facilities drop constraint if exists facilities_quantity_check;
alter table public.facilities add constraint facilities_quantity_check
  check (quantity > 0);

-- The screens list by branch (default view) and group by condition, so both get an index.
create index if not exists facilities_branch_id_idx on public.facilities (branch_id);
create index if not exists facilities_condition_idx on public.facilities (condition);

alter table public.facilities enable row level security;

-- Same model as SCRUM-47 (branches): every signed-in account may read the registry, while
-- inserting, editing and deleting needs the OWNER / CHU role.
drop policy if exists facilities_select_authenticated on public.facilities;
create policy facilities_select_authenticated on public.facilities
  for select
  to authenticated
  using (true);

drop policy if exists facilities_insert_managers on public.facilities;
create policy facilities_insert_managers on public.facilities
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and upper(u.role) in ('OWNER', 'CHU')
    )
  );

drop policy if exists facilities_update_managers on public.facilities;
create policy facilities_update_managers on public.facilities
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and upper(u.role) in ('OWNER', 'CHU')
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and upper(u.role) in ('OWNER', 'CHU')
    )
  );

drop policy if exists facilities_delete_managers on public.facilities;
create policy facilities_delete_managers on public.facilities
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and upper(u.role) in ('OWNER', 'CHU')
    )
  );
