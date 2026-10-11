-- SCRUM-69 — worked time per ca, with the pauses removed.
--
-- The problem: `attendance` stores one `check_in_at` and one `check_out_at`, so "giờ làm" was computed as
-- the span between them. With "/check-in" able to close a ca and re-open it ("Vào ca lại", SCRUM-68), the
-- employee can be *away* between the two, and that gap must not be counted as working time.
--
-- The fix is two derived columns maintained by a trigger — the same shape `attendance_compute_distance`
-- (SCRUM-21) already uses, and for the same reason: every client (the web check-in, the mobile app, a
-- manager's correction) gets the arithmetic right without repeating it.
--
--   * `worked_seconds` — the accumulated time actually worked: each check-out adds the segment that began
--     at the check-in (or at the last re-open) and nothing else, so a pause contributes zero.
--   * `resumed_at`     — when the current segment began after a re-open; `null` while the ca has not been
--     re-opened, in which case the segment starts at `check_in_at`.
--
-- Both are **derived**: the trigger copies the stored values back on every other UPDATE, so a client cannot
-- write them (the web and the mobile app only ever send times and status). A manager's "Sửa giờ" is the
-- exception — it replaces the times, so the trigger recomputes the total from the corrected pair and clears
-- `resumed_at`: a corrected row is one continuous span.
--
-- Applied by hand: Supabase Dashboard → SQL Editor (no migration runner here). Idempotent: safe to re-run.

alter table public.attendance
  add column if not exists worked_seconds integer not null default 0;

alter table public.attendance
  add column if not exists resumed_at timestamptz;

alter table public.attendance
  drop constraint if exists attendance_worked_seconds_check;

alter table public.attendance
  add constraint attendance_worked_seconds_check check (worked_seconds >= 0);

-- Backfill the rows written before this script: their times are the only evidence there is, and they were
-- recorded as one continuous span. `worked_seconds = 0` is what marks a row as "never accumulated", so the
-- statement only touches rows that have not been through the trigger yet.
update public.attendance
set worked_seconds = greatest(
  0,
  extract(epoch from (check_out_at - check_in_at))::integer
)
where check_out_at is not null
  and check_in_at is not null
  and worked_seconds = 0;

create or replace function public.attendance_track_worked_time()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    -- A fresh check-in has worked nothing yet and no resumed segment.
    new.worked_seconds := 0;
    new.resumed_at := null;
    return new;
  end if;

  if new.corrected_at is distinct from old.corrected_at then
    -- "Sửa giờ" (SCRUM-23): the reviewer replaced the times, so the corrected pair is the whole truth —
    -- one span, no pauses, no resumed segment.
    new.worked_seconds := case
      when new.check_in_at is not null and new.check_out_at is not null
        then greatest(0, extract(epoch from (new.check_out_at - new.check_in_at))::integer)
      else old.worked_seconds
    end;
    new.resumed_at := null;
    return new;
  end if;

  if new.check_out_at is not null and old.check_out_at is null then
    -- A check-out closes the segment that started at the check-in, or at the re-open when there was one.
    new.worked_seconds := old.worked_seconds + greatest(
      0,
      extract(epoch from (
        new.check_out_at - coalesce(old.resumed_at, old.check_in_at, new.check_out_at)
      ))::integer
    );
  else
    -- Any other update keeps the total: it is derived here, not sent by a client.
    new.worked_seconds := old.worked_seconds;
  end if;

  if new.check_out_at is null and old.check_out_at is not null then
    -- "Vào ca lại": a new segment starts now; the original giờ vào stays as the arrival evidence.
    new.resumed_at := now();
  else
    new.resumed_at := old.resumed_at;
  end if;

  return new;
end;
$$;

drop trigger if exists attendance_track_worked_time on public.attendance;
create trigger attendance_track_worked_time
  before insert or update on public.attendance
  for each row execute function public.attendance_track_worked_time();

-- Verification (run it after applying): a row that left at 12:15 and re-opened at 13:30 must keep the
-- 11:38 → 12:15 segment only, and `resumed_at` must be set for the new one.
-- select employee_id, check_in_at, check_out_at, resumed_at, worked_seconds
-- from public.attendance
-- order by work_date desc
-- limit 10;
