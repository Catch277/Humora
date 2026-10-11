-- SCRUM-76 — a notification must never abort the business write that produced it.
-- ============================================================================================
-- Symptom this script closes: a chi nhánh trưởng presses "Khai báo mở ca" (or chốt ca, or Xếp ca,
-- or a check-in) and the screen answers the generic `500 Unable to declare opening revenue.` while the
-- *owner* can do the same thing. The row is fine, the role is fine, the branch is theirs — the INSERT
-- is rejected by the AFTER trigger SCRUM-71 put on `daily_revenue`:
--
--   the trigger asks `notify_users(...)` to tell the organization's chủ sở hữu about the declaration,
--   `notify_user` INSERTs into `public.notifications`, and on a hand-made table that INSERT fails with
--   `23502 null value in column "content" ... violates not-null constraint` (SCRUM-55 kept the legacy
--   `content` column and the writer fills `body`). That error is raised *inside the statement's own
--   transaction*, so the revenue declaration rolls back with the notification and the caller sees a
--   `500` that names neither the column nor the notification.
--
-- Why not only SCRUM-73/74: SCRUM-74 relaxes exactly one column (`content`) and SCRUM-73 guards exactly
-- one statement (`notify_user`'s INSERT). Both are correct and this script **subsumes** them (running 73
-- and 74 as well stays harmless — every script in this folder is idempotent), and it goes one step
-- wider so the class of failure cannot come back:
--
--   * §2 relaxes *every* legacy mandatory-without-default column on `public.notifications`, not just the
--     one we know about. A dashboard edit that adds another `NOT NULL` column is the same trap, and it
--     cannot be guessed in advance — it can only be removed generically. (`user_id`, `title`, `body` and
--     `type` stay mandatory: the writer always fills them, and a notification without them is not one.)
--   * §3/§4 restate the guard SCRUM-73 introduced, so one paste is enough even on a project where 73 was
--     never applied — which is the state that produces the `500` in the first place.
--   * §5/§6 prove it with a real, self-deleting INSERT, and report the two things that make a
--     `security definer` writer fail even when the table accepts the row.
--   * §7 is a read-only diagnostic: it names the branch/manager pairs whose `organization_id` disagree,
--     which is the *other* way a manager (and only a manager) can be refused a write.
--
-- §5 proves it on your database: `OK` means the notification INSERT is what the dev-terminal line said
-- (`Failed to declare opening revenue` + a PostgrestError carrying `23502 ... "content"`), and `FAILED`
-- prints the database's real reason instead of the caller's generic `500`.
--
-- Deploy: after SCRUM-70 → 71 → 72 (this script needs their tables and triggers to be meaningful; §0
-- says so if one of them is missing). Run it in Supabase Dashboard → SQL Editor as the project owner —
-- the same role that owns `public.notifications`, which is what makes the `security definer` writer able
-- to bypass the table's RLS. Idempotent: safe to re-run.

-- ── 0. Preconditions (report only, never fails the script) ───────────────────────────────────
-- A `false` here means the fan-out itself is not installed, so `200`/`500` on a revenue declaration has
-- a different cause and the scripts to run are 70 → 71 → 72. Kept a *report* rather than a `raise
-- exception`: §2 is still worth applying on such a database, and a script that refuses to run teaches
-- the operator nothing.
select
  to_regprocedure('public.notify_users(uuid[],text,text,text,text,uuid,interval)') is not null
    as fanout_writer_installed,
  to_regprocedure('public.notification_in_app_enabled(uuid)') is not null
    as settings_gate_installed,
  to_regprocedure('public.organization_owner_ids(uuid)') is not null
    as owner_selector_installed,
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'notify_revenue_opened'
  ) as revenue_trigger_function_installed;

do $$
begin
  if to_regprocedure('public.notify_users(uuid[],text,text,text,text,uuid,interval)') is null then
    raise warning 'SCRUM-76: SCRUM-70/71/72 are not installed — apply those three, then re-run this script. The fan-out cannot be the reason a write fails until then.';
  end if;
end $$;

-- ── 1. What the table demands, right now (read this before §2 changes it) ────────────────────
-- Every row with `is_nullable = NO` and no `column_default` is a column an INSERT *must* provide. The
-- writer (SCRUM-70) provides `user_id`, `title`, `body`, `type`, `related_entity_type` and
-- `related_entity_id`; `is_read`, `created_at` and any `id` have defaults. A mandatory column outside
-- that set is exactly what turns an ordinary revenue declaration into a `500`.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'notifications'
order by ordinal_position;

-- ── 2. Relax every legacy mandatory column the writer does not fill ──────────────────────────
-- `content` is the one we know about; the loop is over all of them on purpose (see the header). The
-- column is *kept* — an older client or report may still read it — it simply stops being mandatory, and
-- a text column gets an empty default so an old reader prints `''` instead of `NULL`.
--
-- Identity and generated columns are skipped: `alter column … drop not null` is not a legal statement
-- for them, and a value nobody inserts is not a trap. The writer's own columns are skipped too.
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
      and c.column_name not in ('id', 'user_id', 'title', 'body', 'type', 'created_at', 'is_read')
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

    execute format(
      'comment on column public.notifications.%I is %L',
      v_column.column_name,
      'Legacy mandatory column of the hand-made table. Relaxed by SCRUM-76: the notification writer (SCRUM-70) fills `body`, so a NOT NULL here made the fan-out raise 23502 inside an AFTER trigger and roll back the revenue declaration, ca, đơn or check-in that produced the notification.'
    );

    raise notice 'SCRUM-76: public.notifications.% is now optional (it was mandatory without a default).',
      v_column.column_name;
    v_relaxed := v_relaxed + 1;
  end loop;

  if v_relaxed = 0 then
    raise notice 'SCRUM-76: no legacy mandatory column left — nothing to relax.';
  end if;
end $$;

-- ── 3. The writer, unable to break its caller ────────────────────────────────────────────────
-- Same definition as SCRUM-73 §2, restated so this script alone removes the coupling: everything before
-- the INSERT is SCRUM-70's (the null guard, the recipient's `in_app` switch, the dedupe window) and only
-- the INSERT is wrapped. PL/pgSQL puts an implicit savepoint around that block, so a failure rolls the
-- notification back alone while the caller's statement keeps the transaction — that is what makes the
-- schedule, the revenue declaration, the đơn and the check-in survive a broken inbox.
--
-- The WARNING is deliberate: the inbox is not the system of record, but a silent loss would be. Search
-- the Postgres log for `notify_user: could not store` when an operation succeeds and no bell rings.
create or replace function public.notify_user(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_type text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_dedupe_window interval default interval '5 minutes'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  if not public.notification_in_app_enabled(p_user_id) then
    return;
  end if;

  if p_entity_id is not null
     and p_dedupe_window is not null
     and p_dedupe_window > interval '0 seconds'
     and exists (
       select 1
       from public.notifications n
       where n.user_id = p_user_id
         and n.type = p_type
         and n.related_entity_type is not distinct from p_entity_type
         and n.related_entity_id = p_entity_id
         and n.created_at > now() - p_dedupe_window
     ) then
    return;
  end if;

  begin
    insert into public.notifications (
      user_id, title, body, type, related_entity_type, related_entity_id
    )
    values (
      p_user_id, p_title, p_body, p_type, p_entity_type, p_entity_id
    );
  exception
    when others then
      -- The inbox is not the system of record: report and carry on. Removing this block makes a broken
      -- notification able to roll back the revenue declaration that produced it.
      raise warning 'notify_user: could not store a % notification for % (% / %): %',
        p_type, p_user_id, p_entity_type, p_entity_id, sqlerrm;
  end;
end;
$$;

revoke execute on function public.notify_user(uuid, text, text, text, text, uuid, interval)
  from public, anon, authenticated;

-- ── 4. The amount label, wide enough for the column's whole domain ───────────────────────────
-- Same definition as SCRUM-73 §1. SCRUM-70's `FM999,999,999,999` is exactly `numeric(14,2)`'s maximum,
-- so a value one digit larger — or a negative difference — could make `to_char` raise *outside* the
-- guard above. Six extra places make that impossible for any figure these columns can hold.
create or replace function public.notification_amount_label(p_amount numeric)
returns text
language sql
stable
as $$
  select case
    when p_amount is null then '—'
    else to_char(p_amount, 'FM999,999,999,999,999,999')
  end;
$$;

revoke execute on function public.notification_amount_label(numeric)
  from public, anon, authenticated;

-- ── 5. Verify: a real, self-deleting insert ───────────────────────────────────────────────────
-- The whole point of §2/§3: can the writer actually store a row? This is a *real* insert run by the SQL
-- Editor's role (the same one the trigger functions run as, i.e. `security definer`'s owner), followed by
-- a delete of the row it created — nothing is left behind. `FAILED` prints the database's own reason,
-- which is what the trigger would have hidden behind the caller's `500`.
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
      values (v_user, 'Kiểm tra SCRUM-76', 'Dòng này bị xoá ngay sau khi kiểm tra.', 'GENERAL', 'scratch');

      v_ok := true;
    exception
      when others then
        v_message := sqlerrm;
    end;
  end if;

  if v_ok then
    delete from public.notifications
    where type = 'GENERAL' and related_entity_type = 'scratch';

    raise notice 'OK — the notification writer can store a row (the test row was deleted). A revenue declaration can no longer be refused because of its notification.';
  else
    raise notice 'FAILED — the notification writer cannot store a row: %', v_message;
  end if;
end $$;

-- ── 6. Verify: the trap is gone, and the provenance names match ───────────────────────────────
-- 1. Expected: no rows. A row here is a column that is still mandatory without a default and is not one
--    of the writer's own — i.e. §2 did not run on this database (or a later dashboard edit added one).
select table_name, column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'notifications'
  and is_nullable = 'NO'
  and column_default is null
  and is_identity = 'NO'
  and is_generated = 'NEVER'
  and column_name not in ('id', 'user_id', 'title', 'body', 'type', 'created_at', 'is_read')
order by ordinal_position;

-- 2. A `security definer` function bypasses RLS only when its owner owns the table (or is a superuser).
--    When the fan-out functions were created by a different role than the one that owns
--    `public.notifications`, the INSERT is refused with `new row violates row-level security policy` and
--    §5 answers `FAILED` — the fix is to run this script (and SCRUM-70) in the SQL Editor as the role that
--    owns the table. The two names should match.
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

-- 3. The writer must stay unreachable from the API roles (both rows `false`), and the operation triggers
--    that call it must be installed exactly once each.
select
  p.proname,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('notify_user', 'notify_users', 'notification_amount_label')
order by p.proname;

select c.relname as table_name, t.tgname, p.proname as function_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
  and p.proname in (
    'notify_revenue_opened', 'notify_revenue_closed',
    'notify_request_created', 'notify_request_reviewed',
    'notify_shift_assigned', 'notify_shift_changed', 'notify_shift_removed',
    'notify_attendance_event'
  )
order by c.relname, t.tgname;

-- ── 7. Verify: the manager path as data (read-only — changes nothing) ────────────────────────
-- The *other* way a chi nhánh trưởng — and only a manager — can be refused a branch write: the app's
-- `assertBranchManagedBy` compares `branches.manager_id` with the caller, while RLS's `heads_branch()`
-- needs that **and** `branches.organization_id = current_organization_id()`. A branch whose two
-- organizations disagree therefore passes the app's check and dies as a `500` instead of a `403`, and the
-- owner never notices because `is_organization_owner()` short-circuits the policy.
--
-- Read `organization_matches`: `false` on a row means that branch can only be written by the owner — open
-- `/branches` and assign its chi nhánh trưởng again (which rewrites `manager_id`), or fix the branch's
-- `organization_id`. `null` means nobody heads that branch yet (nobody to compare with — the owner
-- assigns one on `/branches`). `head_role` is the SCRUM-59 vocabulary — a legacy `CHU` is shown as
-- `MANAGER` (this query does the mapping inline, so it also runs on a database where SCRUM-70 is not
-- applied yet).
select
  b.name as branch,
  u.full_name as head_of_branch,
  coalesce(
    case
      when upper(btrim(coalesce(u.role, ''))) = 'CHU' then 'MANAGER'
      when btrim(coalesce(u.role, '')) = '' then null
      else upper(btrim(u.role))
    end,
    '—'
  ) as head_role,
  b.organization_id as branch_organization,
  u.organization_id as head_organization,
  case
    when u.id is null then null
    else b.organization_id is not distinct from u.organization_id
  end as organization_matches,
  (
    select count(*)
    from public.daily_revenue r
    where r.branch_id = b.id
      and (r.created_at at time zone 'Asia/Bangkok')::date
          = (now() at time zone 'Asia/Bangkok')::date
  ) as revenue_declarations_today
from public.branches b
left join public.users u on u.id = b.manager_id
order by b.name;

