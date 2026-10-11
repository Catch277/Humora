-- SCRUM-24: Quản lý nhân sự (staff administration: the directory, role changes and offboarding).
-- Run this script in Supabase Dashboard > SQL Editor.
--
-- Closes the last manual step in the product: promoting an account, giving a branch manager
-- their role and marking someone as left were SQL snippets executed by hand. The policies below
-- let an OWNER/CHU do it through the app; the data still cannot be changed by anyone else.

-- Also added by SCRUM-22 (the roster needs it); repeated so this script stands alone.
alter table public.users add column if not exists is_active boolean not null default true;

-- ── The staff directory ──────────────────────────────────────────────────────────────────
-- Every signed-in account may read public.users. This is deliberate and narrow in effect: the
-- table holds only id, full_name, role, is_active and created_at — no email, phone, salary or
-- contract data. Four screens depend on it (the schedule and request embeds, the employee-status
-- roster and the staff screen). If a sensitive column is ever added here, split this policy or
-- move the directory into a view instead of widening the embeds.
drop policy if exists users_select_authenticated on public.users;
create policy users_select_authenticated on public.users
  for select
  to authenticated
  using (true);

-- Superseded by the policy above (it exposed the caller's own row only); dropped so the read
-- rule lives in exactly one place.
drop policy if exists users_select_own on public.users;

-- ── Role and employment state are OWNER/CHU decisions ────────────────────────────────────
drop policy if exists users_update_managers on public.users;
create policy users_update_managers on public.users
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

-- No insert policy on purpose: an account is created by signing up (SCRUM-50's trigger writes the
-- profile row). Creating accounts for other people would need the Supabase admin API and a
-- service-role key, which this app deliberately does not have.
