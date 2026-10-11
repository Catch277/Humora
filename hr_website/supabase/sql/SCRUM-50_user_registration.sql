-- SCRUM-50: Đăng ký tài khoản nội bộ (màn hình /register + hồ sơ trong public.users).
-- Run this script in Supabase Dashboard > SQL Editor.
--
-- `public.users` was created by hand in the dashboard before this ticket, so every statement
-- below is written defensively: it creates the table when it is missing and otherwise only
-- fills the gaps. Nothing here deletes or rewrites existing rows.
--
-- If `public.users.role` is a Postgres enum that has no 'EMPLOYEE' label, replace the two
-- 'EMPLOYEE' literals below with a label that exists (see components/Header.tsx ROLE_LABELS:
-- OWNER, CHU, EMPLOYEE).

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null default 'EMPLOYEE',
  created_at timestamptz not null default now()
);

alter table public.users add column if not exists full_name text;
alter table public.users add column if not exists role text;
alter table public.users
  add column if not exists created_at timestamptz not null default now();

-- Self-registration never grants a privileged role: OWNER / CHU (the roles that review
-- requests and manage branches) are granted by an owner, see the snippet at the end.
alter table public.users alter column role set default 'EMPLOYEE';

-- Without this trigger a new auth account has no `public.users` row, and /api/auth/session
-- answers 404 while every RLS policy that reads `users.role` sees nothing. Derived from
-- auth.users: the full name comes from the raw_user_meta_data sent by POST /api/auth/sign-up,
-- falling back to the local part of the email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, full_name, role)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(new.email, '@', 1)
    ),
    'EMPLOYEE'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accounts created before the trigger existed (e.g. via the dashboard or a previous build).
insert into public.users (id, full_name, role)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    split_part(u.email, '@', 1)
  ),
  'EMPLOYEE'
from auth.users u
left join public.users p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

alter table public.users enable row level security;

-- Narrowest read policy: an account may read its own profile, which is what /api/auth/session
-- and the header user card need. Widening this (e.g. all authenticated users) is a PII
-- decision and stays out of this ticket.
drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
  for select
  to authenticated
  using (id = auth.uid());

-- Promote an account to OWNER (run it on its own, with the real address):
-- update public.users set role = 'OWNER'
-- where id = (select id from auth.users where email = 'chu.so.huu@humora.vn');
