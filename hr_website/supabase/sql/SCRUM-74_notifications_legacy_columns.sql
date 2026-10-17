-- SCRUM-74 — the legacy `notifications` shape must accept the rows the fan-out writes.
-- ============================================================================================
-- `public.notifications` was created by hand in the dashboard before SCRUM-48, so SCRUM-48's
-- `create table if not exists` was a no-op and SCRUM-55 could only gap-fill the table (it added
-- `body`, `related_entity_type`, `related_entity_id` and *kept* the hand-made `content`, copying it
-- into `body`). That hand-made `content` is the old message column and it was declared
-- `NOT NULL` — which nothing noticed while nothing inserted a row.
--
-- SCRUM-70 made the database the producer, and its writer fills `body`, `title`, `type`, `user_id`
-- and the related-entity pair — never `content`. On a legacy table the INSERT therefore fails with
-- `23502 null value in column "content" … violates not-null constraint`, and because that INSERT runs
-- *inside* an AFTER trigger, the failure rolls back the statement that produced it: creating or
-- deleting a ca answers `500 Unable to create the shift assignment.`, editing one that only changes a
-- note still works (that path returns before it notifies). This script removes that trap.
--
-- Run it after SCRUM-70 and before SCRUM-73 (whose guard would otherwise hide the failure as a
-- warning). Applied by hand: Supabase Dashboard → SQL Editor. Idempotent; on a database where
-- SCRUM-48 created the table properly there is no `content` column and nothing happens.

-- ── 1. What the table demands (read this list first) ─────────────────────────────────────────
-- Every row below is a column with no default that an INSERT *must* provide. The writer provides
-- `user_id`, `title`, `body`, `type`, `related_entity_type`, `related_entity_id`; `is_read`,
-- `created_at` and any `id` have defaults. Anything else in this list will break every notification.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'notifications'
order by ordinal_position;

-- ── 2. Relax the legacy message column ──────────────────────────────────────────────────────
-- Kept (an older client or report may still read it) but no longer mandatory, and given an empty
-- default so a row written by the trigger still shows a string there instead of NULL.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'content'
  ) then
    execute 'alter table public.notifications alter column content drop not null';
    execute format('alter table public.notifications alter column content set default %L', '');

    execute $mark$
      comment on column public.notifications.content is
        'Legacy column of the hand-made table (kept by SCRUM-55). Nullable with an empty default since SCRUM-74: the notification writer (SCRUM-70) fills `body`, so a NOT NULL here made every notification roll back the business write that produced it.'
    $mark$;

    raise notice 'SCRUM-74: notification.content is now nullable.';
  else
    raise notice 'SCRUM-74: no legacy `content` column — this table was created by SCRUM-48, nothing to do.';
  end if;
end $$;

-- The mirrored case: a legacy table can carry other mandatory columns the writer does not fill. They
-- cannot be guessed, so they are only reported — a row here means "an INSERT that omits this column
-- will fail", and the fix is a default on that column (or a relaxation), never a change to the writer.
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'notifications'
  and is_nullable = 'NO'
  and column_default is null
  and column_name not in (
    'user_id', 'title', 'body', 'type', 'related_entity_type', 'related_entity_id'
  )
order by ordinal_position;
-- Expected: no rows. Any row left here is still a trap for the fan-out.

-- ── 3. Verify the writer end to end ─────────────────────────────────────────────────────────
-- A real, self-deleting insert run as the same role the trigger functions run as. `OK` means the
-- notification path works; `FAILED` prints the database's own reason (read it: it is what the
-- trigger would have hidden behind a `500`).
do $$
declare
  v_user uuid;
  v_ok boolean := false;
  v_message text := 'public.users is empty — run this after somebody has signed up.';
begin
  select id into v_user from public.users limit 1;

  if v_user is not null then
    begin
      insert into public.notifications (user_id, title, body, type, related_entity_type)
      values (v_user, 'Kiểm tra SCRUM-74', 'Dòng này bị xoá ngay sau khi kiểm tra.', 'GENERAL', 'scratch');

      v_ok := true;
    exception
      when others then
        v_message := sqlerrm;
    end;
  end if;

  if v_ok then
    delete from public.notifications
    where type = 'GENERAL' and related_entity_type = 'scratch';

    raise notice 'OK — the notification writer can store a row (the test row was deleted).';
  else
    raise notice 'FAILED — the notification writer cannot store a row: %', v_message;
  end if;
end $$;

-- ── 4. If step 3 said FAILED, read these two names ──────────────────────────────────────────
-- A `security definer` function bypasses RLS only when its owner owns the table (or is a superuser).
-- When the fan-out functions were created by a different role than the one that owns
-- `public.notifications`, the INSERT is refused with `new row violates row-level security policy` and
-- the fix is to re-run SCRUM-70 in the SQL Editor as that owner (the same role that owns the table).
select
  (
    select pg_get_userbyid(c.relowner)
    from pg_class c
    where c.oid = 'public.notifications'::regclass
  ) as notifications_owner,
  (
    select pg_get_userbyid(p.proowner)
    from pg_proc p
    where p.oid = 'public.notify_user(uuid,text,text,text,text,uuid,interval)'::regprocedure
  ) as notify_user_owner;
-- The two names should match.

-- ── 5. The same trap on the other hand-made tables ──────────────────────────────────────────
-- `public.users`, `public.requests`, `public.notification_settings` and `public.notifications` were
-- created by hand in the dashboard before SCRUM-24/41/48, so a `create table if not exists` never
-- re-created them and a legacy column can still be mandatory without a default. Any such column a
-- write does not fill turns an ordinary operation into a `500` — which is exactly what `content` did
-- to the schedule. This is a **report**, not a fix: each line names a column that some write must
-- provide, and the answer is a default on that column (or making it nullable) in a new script.
select table_name, column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('users', 'requests', 'notifications', 'notification_settings')
  and is_nullable = 'NO'
  and column_default is null
  and column_name not in (
    -- Columns every writer/trigger of this app always supplies, so they are not a trap.
    'id', 'user_id', 'employee_id', 'branch_id', 'role', 'full_name', 'is_active',
    'request_type', 'status', 'title', 'body', 'type', 'channel', 'enabled',
    'created_by', 'closed_by', 'approver_id', 'created_at', 'updated_at'
  )
order by table_name, ordinal_position;
-- Expected: no rows. `content` no longer appears because step 2 made it nullable; if it *does* appear,
-- step 2 did not run on this database and the fan-out is still broken.
