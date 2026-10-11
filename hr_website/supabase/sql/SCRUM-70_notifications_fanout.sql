-- SCRUM-70 — the notification fan-out (the producer layer SCRUM-48 never had).
-- ============================================================================================
-- SCRUM-48 shipped the table, the settings, the API and the screen — but nothing ever INSERTed a
-- row: `public.notifications` carried a SELECT and an UPDATE policy only and no producer, so every
-- inbox stayed empty (that is why the bell read 0 on a healthy database). This script is that
-- missing writer; SCRUM-71 and SCRUM-72 are the triggers that call it.
--
-- Why the database emits the event instead of a use case:
--   * the app cannot insert another member's row — the request-scoped client is bound by
--     `auth.uid() = user_id` and this app deliberately has no service-role client;
--   * the mobile app writes `attendance` directly (photo check-in), so a producer living in a route
--     handler would silently miss those events — the same reasoning SCRUM-69 used for
--     `worked_seconds`;
--   * a trigger runs inside the statement's own transaction, so a rolled-back action leaves no
--     phantom notification behind.
--
-- The helpers below are `security definer` (the shape SCRUM-50's `handle_new_user` and SCRUM-51's
-- `join_organization` already use) because they must read `users`/`branches` for a recipient who is
-- not the caller, which RLS would otherwise hide. They are *internal*: Postgres grants EXECUTE to
-- PUBLIC by default, so the `revoke` block at the bottom takes it away — a member must not be able
-- to forge a notification for somebody else through PostgREST. (Trigger functions cannot be called
-- directly at all, so that path is closed by Postgres itself.)
--
-- Applied by hand: Supabase Dashboard → SQL Editor. Idempotent: safe to re-run.

-- ── 1. Indexes the two query shapes need ─────────────────────────────────────────────────────
-- The inbox filters by `type` (the category chips) and the fan-out deduplicates on the entity.
create index if not exists notifications_user_type_created_idx
  on public.notifications (user_id, type, created_at desc);

create index if not exists notifications_related_entity_idx
  on public.notifications (related_entity_type, related_entity_id);

-- ── 2. Role vocabulary ───────────────────────────────────────────────────────────────────────
-- Mirrors `normalizeRole` in lib/domain/roles.ts: `CHU` is the pre-SCRUM-59 spelling of `MANAGER`,
-- and a recipient query must not miss a row that still carries it. Never compare `users.role`
-- directly in the scripts below — go through here, exactly as the app goes through `normalizeRole`.
create or replace function public.normalized_role(p_role text)
returns text
language sql
immutable
as $$
  select case
    when upper(btrim(coalesce(p_role, ''))) = 'CHU' then 'MANAGER'
    else upper(btrim(coalesce(p_role, '')))
  end;
$$;


-- ── 3. Recipient selectors ───────────────────────────────────────────────────────────────────
-- Small aggregates rather than one big join: a trigger reads them once and hands the result to
-- `notify_users`. Every one of them is scoped to a single organization, and every one of them
-- leaves out the accounts that have left (`is_active = false`) — a notification nobody can act on
-- is noise. A *direct* recipient (the account an offboarding notice is about, the requester whose
-- đơn was decided) is deliberately not filtered: that person still deserves the message.

create or replace function public.organization_owner_ids(p_organization_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(u.id order by u.id), '{}'::uuid[])
  from public.users u
  where u.organization_id = p_organization_id
    and public.normalized_role(u.role) = 'OWNER'
    and coalesce(u.is_active, true);
$$;

-- One branch is headed by one account (`branches.manager_id`), so this answers 0 or 1 id; it stays
-- a set because the callers concatenate it with `organization_owner_ids`.
create or replace function public.branch_manager_ids(p_branch_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct b.manager_id), '{}'::uuid[])
  from public.branches b
  join public.users u on u.id = b.manager_id
  where b.id = p_branch_id
    and b.manager_id is not null
    and coalesce(u.is_active, true);
$$;

-- The members of an organization, optionally narrowed to roles (`order by id` keeps the array
-- stable between runs, which makes the output comparable in a verification query).
create or replace function public.organization_member_ids(
  p_organization_id uuid,
  p_roles text[] default null
)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(u.id order by u.id), '{}'::uuid[])
  from public.users u
  where u.organization_id = p_organization_id
    and coalesce(u.is_active, true)
    and (p_roles is null or public.normalized_role(u.role) = any (p_roles));
$$;

-- The organization a branch belongs to. `branches.organization_id` was added by SCRUM-53, so a row
-- written before that script may still carry `null`; the triggers below coalesce this in.
create or replace function public.branch_organization(p_branch_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.organization_id from public.branches b where b.id = p_branch_id;
$$;

-- ── 4. Display helpers (the bodies of the notifications are Vietnamese prose) ────────────────

create or replace function public.notification_actor_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(btrim(u.full_name), '') from public.users u where u.id = p_user_id),
    -- `auth.uid()` is null when the SQL Editor or the staff-account Edge Function (service role)
    -- writes the row; the sentence must still read as a sentence.
    'Hệ thống'
  );
$$;

create or replace function public.notification_branch_name(p_branch_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(btrim(b.name), '') from public.branches b where b.id = p_branch_id),
    'Chi nhánh'
  );
$$;

-- `DD/MM/YYYY`, the way the screens print a work date. Kept here so every body reads identically.
-- `stable`, not `immutable`: `to_char` depends on the session's `lc_time`.
create or replace function public.notification_date_label(p_date date)
returns text
language sql
stable
as $$
  select case when p_date is null then '—' else to_char(p_date, 'DD/MM/YYYY') end;
$$;

-- `FM999,999,999,999` groups by three from the right without the locale's own separator, so the
-- figure reads like money in every database (`lc_numeric` is usually `C` on Supabase).
create or replace function public.notification_amount_label(p_amount numeric)
returns text
language sql
stable
as $$
  select case
    when p_amount is null then '—'
    else to_char(p_amount, 'FM999,999,999,999')
  end;
$$;

-- An instant as a Bangkok wall-clock time (UTC+7, no DST) — the same clock every screen prints.
create or replace function public.notification_time_label(p_at timestamptz)
returns text
language sql
stable
as $$
  select case
    when p_at is null then '—'
    else to_char(p_at at time zone 'Asia/Bangkok', 'HH24:MI')
  end;
$$;

-- ── 5. The inbox switch and the writers ─────────────────────────────────────────────────────

-- `notification_settings` is the drawer on /notifications. `in_app` is the only channel the product
-- delivers today, so it is the master switch: a member who turned it off is not written to. No row
-- means "never touched the drawer" and therefore enabled — a fresh account receives notifications,
-- which is also the default the screen now shows.
create or replace function public.notification_in_app_enabled(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select ns.enabled
      from public.notification_settings ns
      where ns.user_id = p_user_id
        and ns.channel = 'in_app'
    ),
    true
  );
$$;

-- Removes the actor (and any NULL) from a recipient set — nobody is told about their own click.
create or replace function public.without_user(p_user_ids uuid[], p_user_id uuid)
returns uuid[]
language sql
stable
as $$
  select coalesce(array_agg(distinct v.id order by v.id), '{}'::uuid[])
  from unnest(coalesce(p_user_ids, '{}'::uuid[])) as v(id)
  where v.id is not null
    and (p_user_id is null or v.id <> p_user_id);
$$;

-- The one INSERT a notification ever gets. `p_dedupe_window` collapses a burst of edits on the same
-- row (a ca moved twice, a row corrected and then verified) into one message; it applies only when
-- the notification points at an entity, because two entity-less messages of the same type are
-- legitimately different events.
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

  insert into public.notifications (
    user_id, title, body, type, related_entity_type, related_entity_id
  )
  values (
    p_user_id, p_title, p_body, p_type, p_entity_type, p_entity_id
  );
end;
$$;

create or replace function public.notify_users(
  p_user_ids uuid[],
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
declare
  v_user_id uuid;
begin
  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    return;
  end if;

  foreach v_user_id in array p_user_ids loop
    perform public.notify_user(
      v_user_id, p_title, p_body, p_type, p_entity_type, p_entity_id, p_dedupe_window
    );
  end loop;
end;
$$;

-- ── 6. Internal only: take EXECUTE away from the API roles ───────────────────────────────────
-- Postgres grants EXECUTE on a new function to PUBLIC, and PostgREST exposes `public` functions as
-- RPCs — without this block a signed-in member could call `notify_user(<somebody else>, …)` and
-- forge a notification into their inbox. The triggers are unaffected: they run as the function
-- owner, and a trigger function cannot be invoked as a plain RPC at all.
revoke execute on function public.notify_user(uuid, text, text, text, text, uuid, interval)
  from public, anon, authenticated;
revoke execute on function public.notify_users(uuid[], text, text, text, text, uuid, interval)
  from public, anon, authenticated;
revoke execute on function public.notification_in_app_enabled(uuid) from public, anon, authenticated;
revoke execute on function public.organization_owner_ids(uuid) from public, anon, authenticated;
revoke execute on function public.branch_manager_ids(uuid) from public, anon, authenticated;
revoke execute on function public.organization_member_ids(uuid, text[])
  from public, anon, authenticated;
revoke execute on function public.branch_organization(uuid) from public, anon, authenticated;
revoke execute on function public.notification_actor_name(uuid) from public, anon, authenticated;
revoke execute on function public.notification_branch_name(uuid) from public, anon, authenticated;
revoke execute on function public.notification_date_label(date) from public, anon, authenticated;
revoke execute on function public.notification_amount_label(numeric) from public, anon, authenticated;
revoke execute on function public.notification_time_label(timestamptz) from public, anon, authenticated;
revoke execute on function public.normalized_role(text) from public, anon, authenticated;
revoke execute on function public.without_user(uuid[], uuid) from public, anon, authenticated;

-- ── 7. Verify ────────────────────────────────────────────────────────────────────────────────
-- 1. Every helper must answer `false`. A `true` means the revoke did not land and a member could
--    write into another member's inbox through PostgREST.
select
  p.proname,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'notify_user', 'notify_users', 'notification_in_app_enabled',
    'organization_owner_ids', 'branch_manager_ids', 'organization_member_ids',
    'branch_organization', 'notification_actor_name', 'notification_branch_name',
    'notification_date_label', 'notification_amount_label', 'notification_time_label',
    'normalized_role', 'without_user'
  )
order by p.proname;

-- 2. The two indexes must exist.
select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'notifications'
order by indexname;

-- 3. Optional smoke test — it rolls itself back, so nothing is stored. Replace the user id with a
--    real one from `public.users` to confirm the writer can insert into a table whose RLS has no
--    INSERT policy (i.e. that the function owner bypasses RLS, which is what makes this design
--    work).
-- do $$
-- begin
--   perform public.notify_user(
--     '<một user_id thật>'::uuid, 'Kiểm tra', 'Xoá bỏ sau khi chạy.', 'GENERAL', 'test', null, null
--   );
--   raise exception 'ROLLBACK_TEST_OK';
-- exception
--   when others then
--     raise notice 'Fan-out đã chạy được (%), không có dòng nào được lưu.', sqlerrm;
-- end $$;

