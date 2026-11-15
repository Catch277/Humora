-- SCRUM-103 — `notifications.type` must not be constrained by a CHECK.
-- ============================================================================================
-- Symptom this script closes: `/notifications` and the header bell read **zero rows** on a healthy
-- database. Every trigger is installed, the settings gate is open, the producing screens answer `200`,
-- and the table is still empty — the row is rejected by a hand-made constraint instead:
--
--   insert into public.notifications (…, type, …) values (…, 'REQUEST_CREATED', …)
--     ERROR 23514: new row for relation "notifications" violates check constraint
--                  "notifications_type_check"
--
-- `notifications_type_check` exists in **no** script in this folder. Like `requests_request_type_check`
-- (the SCRUM-62 lesson) it was added by hand in the dashboard, with a vocabulary that predates the
-- fan-out: the writers store machine codes (`REQUEST_CREATED`, `REVENUE_OPENED`, `shift_assigned`,
-- `payslip_published`, …) and a new code ships with every ticket. A CHECK cannot be kept in step with a
-- vocabulary that lives in `lib/domain/notificationCatalog.ts`, and it must not be:
--
--   * the SCRUM-70 writers run inside AFTER triggers, so a rejected INSERT aborts the *business* write
--     that produced it — a revenue declaration or a new ca answering `500` for no visible reason. The
--     SCRUM-73/76 guard turns that into a swallowed failure instead, which is exactly how this bug stayed
--     invisible: the operation succeeded and the inbox simply never filled;
--   * an unknown code has to **render**, not refuse the row. The catalog owns the label, the group and the
--     link ("Xem"), and it falls back to the stored value for a code it does not know — that fallback is
--     the reason a script one release ahead cannot break the screen;
--   * `publish_payslips` (SCRUM-90) writes *lowercase* codes (`payslip_published`), so any uppercase
--     enumeration refuses payroll notifications by construction.
--
-- There is deliberately no `in (…)` list here to keep in sync. §1 prints what is being removed, §2 drops
-- every CHECK on this table whose definition mentions `type` (a dashboard can add a second one; only a
-- loop is complete), §3 verifies it is gone and §4 proves a real code and an unknown code both insert,
-- with a self-deleting row so the script leaves the inbox exactly as it found it.
--
-- Deploy: after SCRUM-70 → 71 → 72 (and after 73/74/76/77 if they were ever needed). Idempotent.
-- Nothing in the app reads `type` as an enumeration, so no app change or deploy order matters here.

-- ── 1. What is being removed (report only) ───────────────────────────────────────────────────
select c.conname,
       pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.conrelid = 'public.notifications'::regclass
  and c.contype = 'c'
  and pg_get_constraintdef(c.oid) ilike '%type%'
order by c.conname;

-- ── 2. Drop every CHECK on `notifications` that constrains `type` ────────────────────────────
do $$
declare
  v_constraint record;
  v_dropped integer := 0;
begin
  if to_regclass('public.notifications') is null then
    raise exception 'SCRUM-103: public.notifications does not exist — apply SCRUM-48/55/70 first.';
  end if;

  for v_constraint in
    select c.conname, pg_get_constraintdef(c.oid) as definition
    from pg_constraint c
    where c.conrelid = 'public.notifications'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%type%'
    order by c.conname
  loop
    raise notice 'SCRUM-103: dropping % — %', v_constraint.conname, v_constraint.definition;
    execute format('alter table public.notifications drop constraint %I', v_constraint.conname);
    v_dropped := v_dropped + 1;
  end loop;

  if v_dropped = 0 then
    raise notice 'SCRUM-103: no CHECK constrains notifications.type — nothing to do.';
  else
    raise notice 'SCRUM-103: % constraint(s) dropped.', v_dropped;
  end if;
end $$;

-- ── 3. Verification: no CHECK mentions `type` any more ───────────────────────────────────────
select count(*) as remaining_type_checks
from pg_constraint c
where c.conrelid = 'public.notifications'::regclass
  and c.contype = 'c'
  and pg_get_constraintdef(c.oid) ilike '%type%';

-- ── 4. Proof: a real fan-out code, an unknown code and the writer itself all land ─────────────
-- The rows are deleted again, so this section is safe to re-run on a production project. `FAILED` prints
-- the database's own reason, which is the sentence to act on if something else still refuses the row.
do $$
declare
  v_target uuid;
  v_first uuid;
  v_second uuid;
  v_writer uuid;
begin
  select u.id into v_target
  from public.users u
  where u.is_active
  order by u.created_at nulls last, u.id
  limit 1;

  if v_target is null then
    raise notice 'SCRUM-103: no active public.users row — skipping the proof inserts (§3 already verified the drop).';
    return;
  end if;

  insert into public.notifications (user_id, title, body, type)
  values (v_target, 'SCRUM-103', 'Mã thật của fan-out.', 'REQUEST_CREATED')
  returning id into v_first;

  insert into public.notifications (user_id, title, body, type)
  values (v_target, 'SCRUM-103', 'Một mã chưa có trong catalog.', 'SOMETHING_FROM_A_FUTURE_RELEASE')
  returning id into v_second;

  if to_regprocedure('public.notify_user(uuid,text,text,text,text,uuid,interval)') is not null then
    perform public.notify_user(
      v_target,
      'SCRUM-103',
      'Gọi thẳng notify_user().',
      'SYSTEM_TEST'
    );

    select n.id into v_writer
    from public.notifications n
    where n.user_id = v_target and n.title = 'SCRUM-103' and n.type = 'SYSTEM_TEST'
    order by n.created_at desc
    limit 1;
  end if;

  delete from public.notifications where id in (v_first, v_second, v_writer);

  if v_writer is null then
    raise notice 'OK: the table accepted REQUEST_CREATED and an unknown code. notify_user() was not exercised (SCRUM-70 absent) or stored nothing — re-run §4 after 70 → 71 → 72, and read SCRUM-77 §5 if the second case persists.';
  else
    raise notice 'OK: SCRUM-103 proof passed — REQUEST_CREATED, an unknown code and notify_user() all stored, and all three rows are deleted again.';
  end if;
exception
  when others then
    raise notice 'FAILED: % (%) — the constraint that is left is named in the message above.', sqlerrm, sqlstate;
end $$;

-- ── 5. Aftercare ────────────────────────────────────────────────────────────────────────────
-- 1. Reload `/notifications` (or wait 30 s): the bell polls `GET /api/notifications?unread=true&page_size=1`.
-- 2. Generate one real event — an employee files a đơn, or `/staff` toggles `is_active` — and confirm the
--    owner/manager receives it. The inbox has been empty for the whole life of this project, so there is
--    no backlog to read: only new activity appears.
-- 3. A single account that still receives nothing has its own `notification_settings` row muted
--    (`channel = 'in_app', enabled = false`); no row at all means enabled. That is a per-person switch
--    on `/notifications` → Cài đặt, not a script.

