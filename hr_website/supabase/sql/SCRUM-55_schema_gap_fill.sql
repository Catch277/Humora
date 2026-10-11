-- =============================================================================
-- SCRUM-55: gap-fill the schema the earlier scripts could not add
-- =============================================================================
-- Run by hand in Supabase Dashboard > SQL Editor (there is no migration runner here).
--
-- Why this script exists: `public.notifications`, `public.notification_settings` and
-- `public.requests` already existed in this database before SCRUM-41/48 were written, and both
-- scripts declare their tables with `create table if not exists`. On an existing table that
-- statement is a no-op, so the columns and the foreign key they declare never landed — the same
-- trap AGENTS.md already records for `public.users`, which is why SCRUM-50 only gap-fills it.
--
-- Live symptoms this fixes (all three reproduced against the running database):
--   * GET /api/notifications          -> 500, `column notifications.body does not exist` (42703)
--   * GET /api/notifications/settings -> 500, `column notification_settings.id does not exist` (42703)
--   * GET /api/requests               -> 500, PGRST200 "Could not find a relationship between
--                                        'requests' and 'users'": `requests_user_id_fkey` (SCRUM-41)
--                                        is absent, so the `requester:users!requests_user_id_fkey`
--                                        embed the repository uses cannot resolve.
--
-- Idempotent: every statement is guarded, so running it twice — or on a database that already
-- matches — changes nothing. It is also safe to run SCRUM-41/48 afterwards.

-- Fail loudly and legibly when a prerequisite is missing, instead of with a bare
-- `relation "public.x" does not exist` halfway through the script.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'notifications'
  ) then
    raise exception 'SCRUM-55: public.notifications is missing — apply SCRUM-48_notifications.sql first';
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'notification_settings'
  ) then
    raise exception 'SCRUM-55: public.notification_settings is missing — apply SCRUM-48_notifications.sql first';
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'requests'
  ) then
    raise exception 'SCRUM-55: public.requests is missing — apply SCRUM-41_request_review.sql first';
  end if;
end $$;

-- ── 1. `notifications`: the message column and the related-entity pair ─────────
-- SCRUM-48 declares `body`, `related_entity_type` and `related_entity_id`. This database's table
-- has `content` instead of `body`, and neither of the other two.
alter table public.notifications add column if not exists body text;
alter table public.notifications add column if not exists related_entity_type text;
alter table public.notifications add column if not exists related_entity_id uuid;

-- Carry the old `content` across, otherwise notifications written before this script would lose
-- their message (the API reads `body`). Guarded, because a database where SCRUM-48 created the
-- table properly has no `content` column at all.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'content'
  ) then
    execute $fill$
      update public.notifications
      set body = content
      where body is null and content is not null
    $fill$;

    -- `content` deliberately stays: dropping a column an older client or report may still read is a
    -- separate, approved change.
    execute $mark$
      comment on column public.notifications.content is
        'Legacy column of the hand-made table; the app reads `body` (SCRUM-55).'
    $mark$;
  end if;
end $$;

update public.notifications set body = '' where body is null;
alter table public.notifications alter column body set default '';
alter table public.notifications alter column body set not null;

-- ── 2. `notification_settings`: the surrogate key ────────────────────────────
-- The table has `user_id, channel, enabled, updated_at` only; the repository selects `id`.
alter table public.notification_settings add column if not exists id uuid;
update public.notification_settings set id = gen_random_uuid() where id is null;
alter table public.notification_settings alter column id set default gen_random_uuid();
alter table public.notification_settings alter column id set not null;

-- A primary key cannot be added with `if not exists`, so it needs the guard.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.notification_settings'::regclass
      and contype = 'p'
  ) then
    alter table public.notification_settings
      add constraint notification_settings_pkey primary key (id);
  end if;
end $$;

-- PUT /api/notifications/settings upserts with `onConflict: user_id,channel`; that needs the
-- uniqueness in the database, not only in the route. Guarded because a hand-made table can hold
-- duplicates, and `create index` would then abort the rest of the script.
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
    raise notice 'SCRUM-55: % duplicated (user_id, channel) row(s) in notification_settings — remove them, then re-run this script to create the unique index', v_duplicates;
  elsif not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'notification_settings_user_channel_key'
  ) then
    create unique index notification_settings_user_channel_key
      on public.notification_settings (user_id, channel);
  end if;
end $$;

-- ── 3. The rest of SCRUM-48, restated idempotently ────────────────────────────
create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);

create index if not exists idx_notifications_user_unread
  on public.notifications (user_id)
  where is_read = false;

create or replace function public.update_notification_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_notification_settings_updated_at on public.notification_settings;

create trigger trg_notification_settings_updated_at
  before update on public.notification_settings
  for each row
  execute function public.update_notification_settings_updated_at();

alter table public.notifications enable row level security;
alter table public.notification_settings enable row level security;

-- Conditions copied line by line from SCRUM-48; they are re-created only so that an existing policy
-- cannot make the script fail. Never widen or narrow one without reading its original definition
-- first (a dropped clause is a silent security regression nothing here can catch).
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update using (auth.uid() = user_id);

drop policy if exists notification_settings_select_own on public.notification_settings;
create policy notification_settings_select_own on public.notification_settings
  for select using (auth.uid() = user_id);

drop policy if exists notification_settings_insert_own on public.notification_settings;
create policy notification_settings_insert_own on public.notification_settings
  for insert with check (auth.uid() = user_id);

drop policy if exists notification_settings_update_own on public.notification_settings;
create policy notification_settings_update_own on public.notification_settings
  for update using (auth.uid() = user_id);

-- ── 4. `requests`: the foreign key the `requester` embed resolves through ─────
-- Copied verbatim from SCRUM-41 (`not valid` so legacy rows cannot make it fail), so running
-- SCRUM-41 after this script is still a no-op.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'requests_user_id_fkey'
      and conrelid = 'public.requests'::regclass
  ) then
    alter table public.requests
      add constraint requests_user_id_fkey
      foreign key (user_id) references public.users (id) on delete cascade not valid;
  end if;
end $$;

-- ── Verify ────────────────────────────────────────────────────────────────────
-- 1. Columns: `notifications` must list body, related_entity_type, related_entity_id, and
--    `notification_settings` must list id.
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'notifications'
order by ordinal_position;

select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'notification_settings'
order by ordinal_position;

-- 2. The foreign key must be there (exactly one row):
select conname, convalidated
from pg_constraint
where conname = 'requests_user_id_fkey';

-- 3. Five policies across the two tables (2 + 3):
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('notifications', 'notification_settings')
order by tablename, policyname;

-- 4. Nothing was lost from the legacy column:
select count(*) filter (where body is null or body = '') as empty_bodies,
       count(*) filter (where content is not null and content <> '') as rows_with_legacy_content
from public.notifications;
