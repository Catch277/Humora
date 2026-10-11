-- SCRUM-40: Khai báo doanh thu cuối ca.
-- Run this after SCRUM-39_daily_revenue.sql in Supabase Dashboard > SQL Editor.

alter table public.daily_revenue
  add column if not exists close_amount numeric(14, 2),
  add column if not exists close_note text,
  add column if not exists close_image_url text,
  add column if not exists closed_by uuid references auth.users (id),
  add column if not exists closed_at timestamp with time zone,
  add column if not exists audit_log jsonb not null default '[]'::jsonb;

-- SCRUM-39 enables RLS. This policy permits an authenticated user to close a
-- revenue record while requiring the closing user to match the session user.
drop policy if exists "Authenticated users can close daily revenue" on public.daily_revenue;
create policy "Authenticated users can close daily revenue"
  on public.daily_revenue
  for update
  to authenticated
  using (true)
  with check (closed_by = auth.uid());
