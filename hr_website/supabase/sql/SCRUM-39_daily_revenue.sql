-- SCRUM-39: Khai báo doanh thu đầu ca.
-- Run this script in Supabase Dashboard > SQL Editor.

create table if not exists public.daily_revenue (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null,
  open_amount numeric(14, 2) not null check (open_amount >= 0),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id)
);

-- Enforces one opening declaration per branch for each business day (UTC+7),
-- including concurrent requests that bypass the application-level pre-check.
create unique index if not exists daily_revenue_branch_opening_per_day_idx
  on public.daily_revenue (
    branch_id,
    ((created_at at time zone 'Asia/Bangkok')::date)
  );

alter table public.daily_revenue enable row level security;

drop policy if exists "Authenticated users can read daily revenue" on public.daily_revenue;
create policy "Authenticated users can read daily revenue"
  on public.daily_revenue
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can create their own revenue declaration" on public.daily_revenue;
create policy "Authenticated users can create their own revenue declaration"
  on public.daily_revenue
  for insert
  to authenticated
  with check (created_by = auth.uid());
