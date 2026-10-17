-- SCRUM-77 — the hand-made notification tables must accept the rows the app and the fan-out write.
-- ============================================================================================
-- Two symptoms, one cause: a column `create table if not exists` never added.
--
-- (1) The settings drawer. On `/notifications` → "Cài đặt kênh nhận", gạt một công tắc answers
--   `500 Unable to update notification settings.`
-- for **every** role (owner, manager, employee) — which is why testing several accounts shows the
-- same thing. The write is the caller's own row (`auth.uid() = user_id`), so RLS is satisfied for all
-- of them and the role model (SCRUM-59/61/63) has nothing to do with it: the row is refused by the
-- *table*, exactly like the `content` trap SCRUM-74/76 removed from `notifications`.
--
-- What the drawer sends, and what the table demands:
--   * `lib/infrastructure/repositories/SupabaseNotificationRepository.upsertSettings()` upserts
--     `{ user_id, channel, enabled }` with `onConflict: "user_id,channel"` — nothing else.
--   * `public.notification_settings` was hand-made in the dashboard **before** SCRUM-48, so SCRUM-48's
--     `create table if not exists` was a no-op and its `enabled boolean not null default true` /
--     `updated_at timestamptz not null default now()` never landed. SCRUM-55/56 fixed only the
--     *surrogate key* (`id`), the primary key and the unique index — never those two defaults.
--   * `updated_at` is therefore mandatory with no default, and the `before update` trigger
--     `trg_notification_settings_updated_at` cannot help: it does not run on INSERT. The upsert's
--     INSERT path is rejected with `23502 null value in column "updated_at"` — 100% of the time, for
--     100% of the accounts.
--
-- Why no report ever listed it: SCRUM-74 §5 looks for "is_nullable = NO and column_default is null"
-- **excluding** `updated_at`/`created_at` (as columns "every writer supplies") — but the drawer never
-- supplies `updated_at`. §1 of this script is the missing half of that report.
--
-- (2) The fan-out's own row carries the same hole on `notifications`. SCRUM-76 §2 relaxes mandatory
-- columns the writer does not fill, but it deliberately skips `type`, `is_read` and `created_at` —
-- the ones SCRUM-48 declares with a default. On a table where that declaration never landed, the
-- trigger's INSERT fails on `is_read` or `created_at` exactly like it did on `content`, and the
-- business write rolls back with it. §5 adds those declared defaults back; the right repair for a
-- *meaningful* column is the default it was declared with, not "make it nullable" (a NULL
-- `created_at` would break the inbox ordering instead of the write).
--
-- Deploy: after SCRUM-48/55/56. Idempotent: safe to re-run. Applied by hand in the Supabase dashboard
-- → SQL Editor, as the role that owns the tables. §6/§7 of SCRUM-76 stay the place for the
-- `notify_user` guard and the branch/manager diagnostic.

-- ── 0. What the table demands, right now (read this before §1 changes it) ────────────────────
-- A row with `is_nullable = NO` and an empty `column_default` is a column an INSERT *must* provide.
-- The drawer provides `user_id`, `channel` and `enabled`; `id` is defaulted by SCRUM-55. Anything else
-- here is the `500` — `updated_at` is the one this script expects to find.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'notification_settings'
order by ordinal_position;

-- ── 1. Put SCRUM-48's defaults on the columns the drawer does not write ───────────────────────
-- `id` is restated so a database where someone dropped the default is fixed by the same paste;
-- `enabled` and `updated_at` are the two SCRUM-48 declared and this hand-made table never received.
alter table public.notification_settings
  alter column id set default gen_random_uuid();

alter table public.notification_settings
  alter column enabled set default true;

-- The one that answers `500 Unable to update notification settings.` on every account.
alter table public.notification_settings
  alter column updated_at set default now();

-- The general case, for the reason SCRUM-76 loops over `notifications`: a dashboard edit can add
-- another mandatory column nobody writes, and only a loop can be complete. Every column outside the
-- five the drawer/app work with loses its `NOT NULL` (a text one also gets an empty default, so an
-- old reader prints `''` instead of `NULL`) — never a change to the app's write shape.
do $$
declare
  v_column record;
  v_relaxed integer := 0;
begin
  for v_column in
    select c.column_name, c.data_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'notification_settings'
      and c.is_nullable = 'NO'
      and c.column_default is null
      and c.is_identity = 'NO'
      and c.is_generated = 'NEVER'
      and c.column_name not in ('id', 'user_id', 'channel', 'enabled', 'updated_at')
    order by c.ordinal_position
  loop
    execute format(
      'alter table public.notification_settings alter column %I drop not null',
      v_column.column_name
    );

    if v_column.data_type in ('text', 'character varying', 'character') then
      execute format(
        'alter table public.notification_settings alter column %I set default %L',
        v_column.column_name,
        ''
      );
    end if;

    execute format(
      'comment on column public.notification_settings.%I is %L',
      v_column.column_name,
      'Legacy mandatory column without a default. Relaxed by SCRUM-77: the settings drawer only writes user_id, channel and enabled, so a row it saves cannot provide this column.'
    );

    raise notice 'SCRUM-77: public.notification_settings.% is now optional (it was mandatory without a default).',
      v_column.column_name;
    v_relaxed := v_relaxed + 1;
  end loop;

  if v_relaxed = 0 then
    raise notice 'SCRUM-77: no legacy mandatory column left — nothing to relax.';
  end if;
end $$;

-- ── 2. The two keys PostgREST's upsert reasons about ─────────────────────────────────────────
-- The drawer's `onConflict: "user_id,channel"` is resolved by the database, so the uniqueness must
-- exist *and* be visible to PostgREST (whose schema cache is what it builds the `ON CONFLICT` clause
-- from — hence the reload at the end of this section).
--
-- Duplicates are removed first, keeping the most recently updated row per (user_id, channel): two rows
-- for one channel mean nothing to the drawer (it writes one) and they also break
-- `notification_in_app_enabled()`, whose scalar subquery can only return one row — an error there
-- happens *inside the fan-out trigger*, which is how a duplicate turns into a `500` on a revenue
-- declaration. Deleting here is deliberate: a settings row is a toggle, not history.
do $$
declare
  v_removed integer := 0;
begin
  with ranked as (
    select id,
           row_number() over (
             partition by user_id, channel
             order by updated_at desc nulls last, id
           ) as duplicate_number
    from public.notification_settings
  )
  delete from public.notification_settings ns
  using ranked
  where ns.id = ranked.id
    and ranked.duplicate_number > 1;

  get diagnostics v_removed = row_count;

  if v_removed > 0 then
    raise notice 'SCRUM-77: removed % duplicate (user_id, channel) row(s), keeping the newest of each.', v_removed;
  else
    raise notice 'SCRUM-77: no duplicate (user_id, channel) rows.';
  end if;
end $$;

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
    raise notice 'SCRUM-77: created notification_settings_pkey.';
  else
    raise notice 'SCRUM-77: notification_settings already has a primary key.';
  end if;
end $$;

create unique index if not exists notification_settings_user_channel_key
  on public.notification_settings (user_id, channel);

-- PostgREST resolves `on_conflict` from its own cached schema.
notify pgrst, 'reload schema';

-- ── 3. The per-user policies the drawer needs (SCRUM-48, restated idempotently) ──────────────
-- A missing INSERT policy would answer `42501` for every role; restating them keeps this script a
-- complete repair of the write path. The conditions are copied from SCRUM-48/55 line by line — never
-- widen or narrow one without reading its original definition first.
alter table public.notification_settings enable row level security;

drop policy if exists notification_settings_select_own on public.notification_settings;
create policy notification_settings_select_own on public.notification_settings
  for select using (auth.uid() = user_id);

drop policy if exists notification_settings_insert_own on public.notification_settings;
create policy notification_settings_insert_own on public.notification_settings
  for insert with check (auth.uid() = user_id);

drop policy if exists notification_settings_update_own on public.notification_settings;
create policy notification_settings_update_own on public.notification_settings
  for update using (auth.uid() = user_id);

-- ── 4. Verify: the exact statement the drawer sends, run and rolled back ─────────────────────
-- `insert … on conflict (user_id, channel) do update` is what `.upsert(rows, { onConflict })` becomes.
-- The probe uses a scratch channel the app never writes, so a real preference is never touched, and
-- the row is deleted again at the end. `OK` means the drawer saves; `FAILED` prints the database's own
-- reason — the sentence the route hides behind its generic `500`.
do $$
declare
  v_user uuid;
  v_stored boolean;
  v_message text;
begin
  select id into v_user from public.users limit 1;

  if v_user is null then
    raise notice 'FAILED — public.users is empty: run this script after somebody has signed up.';
    return;
  end if;

  begin
    insert into public.notification_settings (user_id, channel, enabled)
    values (v_user, 'scratch', true)
    on conflict (user_id, channel) do update set enabled = excluded.enabled;

    select ns.enabled into v_stored
    from public.notification_settings ns
    where ns.user_id = v_user
      and ns.channel = 'scratch';

    raise notice 'OK — the drawer''s upsert was stored and read back (enabled = %). Toggling a channel now saves.', v_stored;
  exception
    when others then
      v_message := sqlerrm || ' (SQLSTATE ' || sqlstate || ')';
      raise notice 'FAILED — the drawer''s upsert is still refused: %', v_message;
  end;

  -- Always clean up: `scratch` is not a channel the app uses, and a leftover row would be noise.
  -- (After a failure there is nothing to delete — the exception block rolled its own work back.)
  delete from public.notification_settings where channel = 'scratch';
end $$;


-- ── 5. Verify: the mute the fan-out reads must agree with what was stored ────────────────────
-- The drawer's switch is only half the feature: `public.notification_in_app_enabled()` (SCRUM-70) is the
-- gate every trigger asks before writing an inbox row. It is a `security definer`, so it sees the row
-- only when its owner owns `notification_settings` (or is a superuser). When the two owners differ the
-- read is filtered by `notification_settings_select_own` — which, inside a trigger, runs with the
-- *actor's* `auth.uid()` and therefore never matches the *recipient* — the gate answers `true`, and a
-- member who switched notifications off keeps receiving them. A `stored = false, gate = true` line below
-- is that bug; the fix is to re-run SCRUM-70 (or SCRUM-76 §3) in the SQL Editor as the role that owns
-- the table.
--
-- This block reports per account instead of one `select` on purpose: it must also survive a database
-- where SCRUM-70 has not been applied yet (then there is no gate to compare with, and saying so is more
-- useful than a `function does not exist` error halfway through the script).
do $$
declare
  r record;
  v_checked integer := 0;
  v_mismatch integer := 0;
begin
  if to_regprocedure('public.notification_in_app_enabled(uuid)') is null then
    raise notice 'SCRUM-77: SCRUM-70 is not installed, so there is no gate to compare against — apply SCRUM-70 → 71 → 72, then re-run this script.';
    return;
  end if;

  for r in execute $q$
    select u.id,
           u.full_name,
           (select ns.enabled from public.notification_settings ns
             where ns.user_id = u.id and ns.channel = 'in_app') as stored_value,
           public.notification_in_app_enabled(u.id) as gate_value
    from public.users u
    where exists (
      select 1 from public.notification_settings ns
      where ns.user_id = u.id and ns.channel = 'in_app'
    )
    order by u.full_name
    limit 20
  $q$
  loop
    v_checked := v_checked + 1;

    if r.stored_value is not distinct from r.gate_value then
      raise notice 'OK   %: stored = %, gate = % — the switch is honoured.', r.full_name, r.stored_value, r.gate_value;
    else
      v_mismatch := v_mismatch + 1;
      raise notice 'FAIL %: stored = %, gate = % — the definer cannot see the row: re-run SCRUM-70 as the owner of public.notification_settings.', r.full_name, r.stored_value, r.gate_value;
    end if;
  end loop;

  if v_checked = 0 then
    raise notice 'SCRUM-77: no account has saved an "in_app" preference yet — flip the switch once on /notifications and re-run §5 to check the gate.';
  elsif v_mismatch = 0 then
    raise notice 'SCRUM-77: % account(s) checked, every stored switch is honoured.', v_checked;
  end if;
end $$;

-- ── 6. The same hole on `notifications`: the defaults SCRUM-48 declares ──────────────────────
-- The fan-out's writer (SCRUM-70) fills `user_id`, `title`, `body`, `type` and the related-entity pair
-- and nothing else, so on a hand-made table every declaration below is a trap with the *exact* shape of
-- `content`: the INSERT raises `23502` inside an AFTER trigger, and the revenue declaration, ca or đơn
-- that produced it rolls back with the notification (the `500 Unable to declare opening revenue.` of
-- SCRUM-76). SCRUM-76 §2 skipped these three on purpose — they are meaningful columns, so the repair is
-- the default they were declared with, never "make it nullable".
--
-- Setting a default where one already exists changes nothing, so this is safe on a database where
-- SCRUM-48 did create the table properly.
do $$
begin
  if to_regclass('public.notifications') is null then
    raise notice 'SCRUM-77: public.notifications is missing — apply SCRUM-48_notifications.sql first.';
    return;
  end if;

  execute 'alter table public.notifications alter column type set default ''general''';
  execute 'alter table public.notifications alter column is_read set default false';
  execute 'alter table public.notifications alter column created_at set default now()';

  raise notice 'SCRUM-77: notifications.type / is_read / created_at carry the defaults SCRUM-48 declares.';
end $$;

-- The columns above must stay mandatory (`is_read` being NULL would make the unread badge count
-- nothing, `created_at` being NULL would break the ordering); only an *unknown* leftover column is
-- relaxed, exactly as SCRUM-76 §2 does for this table.
do $$
declare
  v_column record;
  v_relaxed integer := 0;
begin
  for v_column in
    select c.column_name, c.data_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'notifications'
      and c.is_nullable = 'NO'
      and c.column_default is null
      and c.is_identity = 'NO'
      and c.is_generated = 'NEVER'
      and c.column_name not in (
        'id', 'user_id', 'title', 'body', 'type', 'is_read', 'created_at',
        'related_entity_type', 'related_entity_id'
      )
    order by c.ordinal_position
  loop
    execute format(
      'alter table public.notifications alter column %I drop not null',
      v_column.column_name
    );

    if v_column.data_type in ('text', 'character varying', 'character') then
      execute format(
        'alter table public.notifications alter column %I set default %L',
        v_column.column_name,
        ''
      );
    end if;

    raise notice 'SCRUM-77: public.notifications.% is now optional (it was mandatory without a default).',
      v_column.column_name;
    v_relaxed := v_relaxed + 1;
  end loop;

  if v_relaxed = 0 then
    raise notice 'SCRUM-77: no unexpected mandatory column on notifications.';
  end if;
end $$;

-- ── 7. Verify: the keys and the policies, as the database has them ───────────────────────────
-- Expect the primary key, the unique key the upsert needs, and the three per-user policies.
select c.conname, c.contype
from pg_constraint c
where c.conrelid = 'public.notification_settings'::regclass
order by c.conname;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'notification_settings'
order by indexname;

select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'notification_settings'
order by policyname;

-- And the fan-out's table: `type`, `is_read` and `created_at` must now carry a default (the column list
-- of §0, for the other table). `content` may still be there — SCRUM-74/76 made it optional on purpose.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'notifications'
order by ordinal_position;

