-- SCRUM-51: Tổ chức (organizations), mã tham gia, lời mời và luồng gia nhập.
-- Run this script in Supabase Dashboard > SQL Editor.
--
-- Why this exists: until now every signed-in account was a peer — `role` was global, RLS said
-- "any authenticated user" and there was no tenant. This script introduces the organization as
-- the unit a person belongs to, with a join code the owner shares and an allow-list
-- (`organization_invites`) that decides who may spend that code. Registering grants nothing:
-- whoever creates an organization becomes its OWNER.
--
-- The state-changing flows are `security definer` RPCs on purpose. A caller legitimately needs to
-- change their own `users.organization_id` and `role`, which `users_update_managers` (SCRUM-24)
-- forbids, and must not be able to read another organization's invites — so the check lives in
-- SQL where it cannot be bypassed by a hand-written request.

-- ── Tables ───────────────────────────────────────────────────────────────────────────────
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The join code lives in its own table because row level security filters *rows*, not *columns*:
-- on `organizations` (which every member may read) each employee could read the code. Here the
-- policy below keeps it to OWNER/CHU of that organization.
create table if not exists public.organization_join_codes (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  code text not null,
  updated_by uuid references public.users (id),
  updated_at timestamptz not null default now()
);

create unique index if not exists organization_join_codes_code_key
  on public.organization_join_codes (upper(code));

alter table public.users
  add column if not exists organization_id uuid references public.organizations (id);

-- Set when an owner provisions an account (SCRUM-52): the employee must choose their own password
-- before the rest of the app opens.
alter table public.users
  add column if not exists must_change_password boolean not null default false;

-- "The accounts the owner created": the allow-list that makes the join code usable only by people
-- this organization registered (source 'provisioned' = account created with a temporary password
-- by an owner, 'invite' = the owner asked an already-registered account to join).
create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'EMPLOYEE',
  source text not null default 'invite',
  invited_by uuid references public.users (id),
  claimed_by uuid references public.users (id),
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint organization_invites_role_check check (role in ('EMPLOYEE', 'CHU')),
  constraint organization_invites_source_check check (source in ('invite', 'provisioned'))
);

create unique index if not exists organization_invites_email_idx
  on public.organization_invites (organization_id, lower(email));

-- Both an audit trail and the brute-force throttle for the code: ten failures per user per hour.
create table if not exists public.organization_join_attempts (
  id bigserial primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete set null,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);

create index if not exists organization_join_attempts_user_idx
  on public.organization_join_attempts (user_id, attempted_at desc);

create index if not exists organization_invites_org_idx
  on public.organization_invites (organization_id, claimed_at);

-- ── Create / join / rotate ───────────────────────────────────────────────────────────────
-- Registering grants nothing; this is what makes somebody an OWNER.
create or replace function public.create_organization(p_name text)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_code text;
  v_org public.organizations;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (select 1 from public.users where id = v_user) then
    raise exception 'ACCOUNT_HAS_NO_PROFILE';
  end if;

  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'ORGANIZATION_NAME_INVALID';
  end if;

  if exists (
    select 1 from public.users where id = v_user and organization_id is not null
  ) then
    raise exception 'ALREADY_IN_ORGANIZATION';
  end if;

  insert into public.organizations (name, created_by)
  values (v_name, v_user)
  returning * into v_org;

  loop
    v_code := public.generate_organization_code();
    exit when not exists (
      select 1 from public.organization_join_codes where upper(code) = v_code
    );
  end loop;

  insert into public.organization_join_codes (organization_id, code, updated_by)
  values (v_org.id, v_code, v_user);

  update public.users
  set organization_id = v_org.id,
      role = 'OWNER'
  where id = v_user;

  return v_org;
end;
$$;

-- Two factors, not one: the correct code is useless without an invite row for the caller's email,
-- so somebody who guesses or is handed the code still cannot enter the organization.
create or replace function public.join_organization(p_code text)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_email text;
  v_org_id uuid;
  v_org public.organizations;
  v_invite public.organization_invites;
  v_failures integer;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if exists (
    select 1 from public.users where id = v_user and organization_id is not null
  ) then
    raise exception 'ALREADY_IN_ORGANIZATION';
  end if;

  select email into v_email from auth.users where id = v_user;

  if v_email is null then
    raise exception 'ACCOUNT_HAS_NO_EMAIL';
  end if;

  select count(*) into v_failures
  from public.organization_join_attempts
  where user_id = v_user
    and succeeded = false
    and attempted_at > now() - interval '1 hour';

  if v_failures >= 10 then
    raise exception 'TOO_MANY_ATTEMPTS';
  end if;

  select organization_id into v_org_id
  from public.organization_join_codes
  where upper(code) = v_code;

  if v_org_id is null then
    insert into public.organization_join_attempts (user_id, organization_id, succeeded)
    values (v_user, null, false);

    raise exception 'INVALID_CODE';
  end if;

  select * into v_invite
  from public.organization_invites
  where organization_id = v_org_id
    and lower(email) = lower(v_email)
    and claimed_by is null;

  if v_invite.id is null then
    insert into public.organization_join_attempts (user_id, organization_id, succeeded)
    values (v_user, v_org_id, false);

    raise exception 'NOT_INVITED';
  end if;

  update public.organization_invites
  set claimed_by = v_user,
      claimed_at = now()
  where id = v_invite.id;

  -- The role comes from the invite and never exceeds CHU: an invite cannot mint an OWNER.
  update public.users
  set organization_id = v_org_id,
      role = coalesce(v_invite.role, 'EMPLOYEE')
  where id = v_user;

  insert into public.organization_join_attempts (user_id, organization_id, succeeded)
  values (v_user, v_org_id, true);

  select * into v_org from public.organizations where id = v_org_id;

  return v_org;
end;
$$;

create or replace function public.regenerate_organization_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org_id uuid;
  v_code text;
begin
  select organization_id into v_org_id
  from public.users
  where id = v_user and upper(coalesce(role, '')) = 'OWNER';

  if v_org_id is null then
    raise exception 'NOT_ORGANIZATION_OWNER';
  end if;

  loop
    v_code := public.generate_organization_code();
    exit when not exists (
      select 1 from public.organization_join_codes where upper(code) = v_code
    );
  end loop;

  update public.organization_join_codes
  set code = v_code,
      updated_by = v_user,
      updated_at = now()
  where organization_id = v_org_id;

  return v_code;
end;
$$;

-- An employee cannot update their own `users` row (users_update_managers needs OWNER/CHU), so the
-- flag SCRUM-52 sets is cleared through this narrow RPC after they pick their own password.
create or replace function public.complete_password_change()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.users set must_change_password = false where id = auth.uid();

  return true;
end;
$$;

-- ── Helpers ──────────────────────────────────────────────────────────────────────────────
-- Defined after the RPCs that call them: plpgsql resolves function calls at run time, so keeping
-- the flows readable first costs nothing.

-- `organization_id` of the calling session; null while they have not created or joined one.
create or replace function public.current_organization_id()
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select organization_id from public.users where id = auth.uid()
$$;

-- OWNER/CHU of their own organization — the same rule the rest of the app uses for management.
create or replace function public.is_organization_manager()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and upper(coalesce(u.role, '')) in ('OWNER', 'CHU')
  )
$$;

-- 8 characters, no 0/O/1/I/L so a code can be read out loud without confusion.
create or replace function public.generate_organization_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text := '';
  i integer;
begin
  for i in 1..8 loop
    v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
  end loop;

  return v_code;
end;
$$;

-- ── Row level security ───────────────────────────────────────────────────────────────────
alter table public.organizations enable row level security;
alter table public.organization_join_codes enable row level security;
alter table public.organization_invites enable row level security;
alter table public.organization_join_attempts enable row level security;

-- A member reads their own organization. No insert policy: an organization only comes into
-- existence through `create_organization`.
drop policy if exists organizations_select_members on public.organizations;
create policy organizations_select_members on public.organizations
  for select
  to authenticated
  using (id = public.current_organization_id());

drop policy if exists organizations_update_owners on public.organizations;
create policy organizations_update_owners on public.organizations
  for update
  to authenticated
  using (id = public.current_organization_id() and public.is_organization_manager())
  with check (id = public.current_organization_id() and public.is_organization_manager());

-- The join code is for OWNER/CHU only; the definer RPCs are the only writers, so no
-- insert/update/delete policy exists here on purpose.
drop policy if exists organization_join_codes_select_managers on public.organization_join_codes;
create policy organization_join_codes_select_managers on public.organization_join_codes
  for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  );

-- Invites are the owner's register of accounts, so only their own organization's managers see it.
drop policy if exists organization_invites_select_managers on public.organization_invites;
create policy organization_invites_select_managers on public.organization_invites
  for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  );

drop policy if exists organization_invites_insert_managers on public.organization_invites;
create policy organization_invites_insert_managers on public.organization_invites
  for insert
  to authenticated
  with check (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
    and (invited_by is null or invited_by = auth.uid())
  );

drop policy if exists organization_invites_delete_managers on public.organization_invites;
create policy organization_invites_delete_managers on public.organization_invites
  for delete
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  );

-- The attempt trail doubles as the throttle, so managers may read their own organization's rows;
-- the RPC writes them as its definer owner.
drop policy if exists organization_join_attempts_select_managers on public.organization_join_attempts;
create policy organization_join_attempts_select_managers on public.organization_join_attempts
  for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  );

-- ── users: scope the directory to the caller's organization ──────────────────────────────
-- SCRUM-24 opened the directory to every signed-in account, which is exactly wrong once tenants
-- exist: `/staff`, the schedule/requests/attendance embeds and `get_employee_status` would mix
-- organizations. An account with no organization sees itself only.
drop policy if exists users_select_authenticated on public.users;
create policy users_select_authenticated on public.users
  for select
  to authenticated
  using (
    id = auth.uid()
    or organization_id = public.current_organization_id()
  );

drop policy if exists users_update_managers on public.users;
create policy users_update_managers on public.users
  for update
  to authenticated
  using (
    organization_id is not null
    and organization_id = public.current_organization_id()
    and public.is_organization_manager()
  )
  with check (
    organization_id = public.current_organization_id()
    and public.is_organization_manager()
  );

-- ── Grants ───────────────────────────────────────────────────────────────────────────────
-- Functions are executable by PUBLIC by default, so revoke first. The code generator is for the
-- RPCs above only; they run as the function owner, so they do not need a grant.
revoke all on function public.generate_organization_code() from public;

grant execute on function public.current_organization_id() to authenticated;
grant execute on function public.is_organization_manager() to authenticated;
grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.join_organization(text) to authenticated;
grant execute on function public.regenerate_organization_code() to authenticated;
grant execute on function public.complete_password_change() to authenticated;

-- ── After running this ───────────────────────────────────────────────────────────────────
-- 1. Sign in and create your organization on /onboarding: whoever creates it becomes its OWNER.
-- 2. Accounts that existed before keep `organization_id = null`, so they see only themselves
--    until they are invited (or create an organization of their own).
-- 3. The operational tables (branches, revenue, attendance, requests, ...) are still
--    organization-agnostic — SCRUM-53 adds `organization_id` to them. Until that runs, an
--    organization is a join gate, not data isolation. Do not describe it as isolation yet.
