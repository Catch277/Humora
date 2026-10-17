-- SCRUM-73 — a notification must never break the business write that produced it.
-- ============================================================================================
-- SCRUM-70/71/72 made the database the producer of the inbox: every shift assignment, revenue close,
-- đơn, attendance row and staff change now runs a trigger that calls `public.notify_user`. That is a
-- correct design (the app cannot insert another member's row) but it puts a *convenience* feature
-- inside the transaction of the system of record: if the INSERT into `public.notifications` fails —
-- a definer whose owner is subject to RLS, a missing grant, a future edit with a typo — then the
-- shift assignment that fired the trigger is rolled back with it, and the schedule looks broken for
-- every role. This script removes that coupling:
--
--   * `notify_user` catches its own failure, writes a WARNING to the Postgres log and returns, so the
--     trigger reports "the notification did not happen" instead of the statement failing;
--   * `notification_amount_label` gets a pattern wide enough for any `numeric(14,2)` amount, so
--     `to_char` cannot raise "value overflows numeric format" on a revenue figure either.
--
-- The warning is deliberate: the inbox is not the system of record, but a silent loss would be. Look
-- for `notify_user: could not store` in the database logs — `/api/notifications` staying empty while
-- the operation succeeds is the symptom.
--
-- Depends on SCRUM-70 (it re-creates one of its functions). Applied by hand: Supabase Dashboard →
-- SQL Editor. Idempotent, and safe to run after SCRUM-70/71/72 at any time.

-- ── 1. The amount label, wide enough for the column's whole domain ───────────────────────────
-- SCRUM-70 used `FM999,999,999,999` (12 digits), which is exactly `numeric(14,2)`'s maximum: a value
-- one digit larger, or a negative close amount, would raise out of the trigger. Six extra places make
-- that impossible for any figure these columns can hold.
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

-- ── 2. The writer, now failure-tolerant ─────────────────────────────────────────────────────
-- Everything before the INSERT is kept exactly as SCRUM-70 wrote it (the null guard, the recipient's
-- `in_app` switch, the dedupe window); only the INSERT is wrapped. PL/pgSQL puts an implicit savepoint
-- around the block, so a failure rolls back the notification alone and the caller's statement keeps
-- the transaction — that is what makes the schedule, the revenue close and the đơn survive a broken
-- inbox.
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
      -- The inbox is not the system of record: report and carry on. Removing this block makes a
      -- broken notification able to roll back the shift assignment that produced it.
      raise warning 'notify_user: could not store a % notification for % (% / %): %',
        p_type, p_user_id, p_entity_type, p_entity_id, sqlerrm;
  end;
end;
$$;

revoke execute on function public.notify_user(uuid, text, text, text, text, uuid, interval)
  from public, anon, authenticated;

-- ── 3. Verify ────────────────────────────────────────────────────────────────────────────────
-- 1. The whole point of this script: can the writer actually reach `public.notifications`?
--    This is a *real* insert, run as the same role the trigger functions run as (the owner of
--    `notify_user`), followed by a delete of the row it created — nothing is left behind.
--
--    A `FAILED` line means every trigger in SCRUM-70/71/72 will now log a warning and store nothing:
--    run the scripts as the project owner in the SQL Editor (the ones that own these functions), and
--    check that `public.notifications` has no `FORCE ROW LEVEL SECURITY`.
do $$
declare
  v_user uuid;
  v_ok boolean := false;
  v_message text := 'public.users is empty — run this after somebody has signed up.';
begin
  select id into v_user from public.users limit 1;

  if v_user is not null then
    begin
      insert into public.notifications (
        user_id, title, body, type, related_entity_type
      )
      values (
        v_user, 'Kiểm tra SCRUM-73', 'Dòng này bị xoá ngay sau khi kiểm tra.', 'GENERAL', 'scratch'
      );

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

-- 2. The writer must stay unreachable from the API roles.
select
  p.proname,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('notify_user', 'notification_amount_label')
order by p.proname;
-- Both rows must read `false`.

-- 3. Optional end-to-end check on a real schedule write: the assignment must succeed *and* the bell
--    of its branch head must gain a row.
-- select count(*) as before_count from public.notifications;
-- -- create or move one ca on /schedules, then:
-- select count(*) as after_count from public.notifications;
--    `after_count` must be `before_count + 1`; if it is unchanged, read the database log for a
--    `notify_user: could not store` warning.
