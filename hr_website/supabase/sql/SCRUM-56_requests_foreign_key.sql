-- =============================================================================
-- SCRUM-56: create `requests_user_id_fkey` (the reason /api/requests answers 500)
-- =============================================================================
-- Run by hand in Supabase Dashboard > SQL Editor and **read the notices** ("Messages" next to
-- "Results"): this script reports what the database says instead of failing silently.
--
-- Where we are: `SCRUM-55_schema_gap_fill.sql` fixed the two notification tables (their columns and
-- key are now visible through PostgREST), but `requests` still has **no foreign keys at all** —
-- neither `requests_user_id_fkey` nor `requests_branch_id_fkey` resolves — so the repository's
-- `requester:users!requests_user_id_fkey` embed cannot be resolved and PostgREST answers
--   PGRST200 "Could not find a relationship between 'requests' and 'users'"
-- which the route turns into a 500 and the screen shows as "Unable to retrieve requests."
--
-- Two things are already ruled out, both verified against the live database:
--   * `public.users.id` IS unique — `attendance`, `shift_assignments` and `organizations` all have
--     working foreign keys into it, so a reference to it is legal.
--   * the PostgREST schema cache is not stale — the columns SCRUM-55 added are visible, so a reload
--     happened since; an FK created by that script would have appeared in the same reload.
--
-- So the constraint was never created. This script creates it, prints the database's own error text
-- if it cannot, and asks PostgREST to reload its cache afterwards.

-- ── What the relations actually are, and which constraints already exist ──────
do $$
declare
  r record;
begin
  for r in
    select c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('requests', 'notifications', 'notification_settings', 'users')
    order by c.relname
  loop
    raise notice 'relation public.% is relkind=% (r = table, v = view)', r.relname, r.relkind;
  end loop;

  for r in
    select c.conname, c.contype, c.convalidated
    from pg_constraint c
    where c.conrelid in (
      'public.requests'::regclass,
      'public.notifications'::regclass,
      'public.notification_settings'::regclass
    )
    order by c.conname
  loop
    raise notice 'constraint % (type=%, validated=%)', r.conname, r.contype, r.convalidated;
  end loop;
end $$;

-- ── The missing foreign keys ──────────────────────────────────────────────────
-- Each one is attempted in its own sub-block with an exception handler, so a failure prints the
-- database's reason and the rest of the script still runs (e.g. when `requests` turns out not to be
-- a plain table, no foreign key can be added to it — and that is the answer we need).
do $$
begin
  begin
    alter table public.requests drop constraint if exists requests_user_id_fkey;
    alter table public.requests
      add constraint requests_user_id_fkey
      foreign key (user_id) references public.users (id) on delete cascade not valid;
    raise notice 'SCRUM-56: created requests_user_id_fkey';
  exception when others then
    raise notice 'SCRUM-56: requests_user_id_fkey FAILED -> % (SQLSTATE %)', sqlerrm, sqlstate;
  end;

  -- SCRUM-48 declares both of these too. Nothing in the UI embeds them yet, but a missing foreign key
  -- is exactly what broke the two screens above, so the schema is brought back in line.
  begin
    alter table public.notifications drop constraint if exists notifications_user_id_fkey;
    alter table public.notifications
      add constraint notifications_user_id_fkey
      foreign key (user_id) references public.users (id) on delete cascade not valid;
    raise notice 'SCRUM-56: created notifications_user_id_fkey';
  exception when others then
    raise notice 'SCRUM-56: notifications_user_id_fkey FAILED -> % (SQLSTATE %)', sqlerrm, sqlstate;
  end;

  begin
    alter table public.notification_settings drop constraint if exists notification_settings_user_id_fkey;
    alter table public.notification_settings
      add constraint notification_settings_user_id_fkey
      foreign key (user_id) references public.users (id) on delete cascade not valid;
    raise notice 'SCRUM-56: created notification_settings_user_id_fkey';
  exception when others then
    raise notice 'SCRUM-56: notification_settings_user_id_fkey FAILED -> % (SQLSTATE %)', sqlerrm, sqlstate;
  end;
end $$;

-- ── Whatever SCRUM-55 could not finish on `notification_settings` ─────────────
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.notification_settings'::regclass
      and contype = 'p'
  ) then
    execute 'alter table public.notification_settings add constraint notification_settings_pkey primary key (id)';
    raise notice 'SCRUM-56: created notification_settings_pkey';
  else
    raise notice 'SCRUM-56: notification_settings already has a primary key';
  end if;
end $$;

do $$
declare
  v_duplicates bigint;
begin
  select count(*)
  into v_duplicates
  from (
    select 1
    from public.notification_settings
    group by user_id, channel
    having count(*) > 1
  ) duplicates;

  if v_duplicates > 0 then
    raise notice 'SCRUM-56: % duplicated (user_id, channel) row(s) — clean them, then re-run', v_duplicates;
  else
    execute 'create unique index if not exists notification_settings_user_channel_key on public.notification_settings (user_id, channel)';
    raise notice 'SCRUM-56: notification_settings (user_id, channel) is unique';
  end if;
end $$;

-- PostgREST resolves embeds from its own schema cache: ask it to reload so the new foreign keys are
-- visible to the running API without waiting for the next DDL event.
notify pgrst, 'reload schema';

-- ── Verify ────────────────────────────────────────────────────────────────────
-- Expect three rows, all contype = 'f'. `convalidated` may stay false: `not valid` deliberately
-- skips the check of legacy rows, and PostgREST does not care.
select conname, contype, convalidated
from pg_constraint
where conname in (
  'requests_user_id_fkey',
  'notifications_user_id_fkey',
  'notification_settings_user_id_fkey'
)
order by conname;

-- If the notice said `requests_user_id_fkey FAILED`, this line shows what `public.requests` is and
-- paste its output: a view (relkind = 'v') cannot carry a foreign key, and that is then the real fix.
-- (The CASE keeps `pg_get_viewdef` from running against a plain table, where it would error.)
select c.relname,
       c.relkind,
       case
         when c.relkind = 'v' then pg_get_viewdef('public.requests'::regclass, true)
         else '(not a view)'
       end as view_definition
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'requests';
