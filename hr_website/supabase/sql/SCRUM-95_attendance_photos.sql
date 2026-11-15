-- SCRUM-95 — Ảnh chấm công (A4 "Automated Timekeeping"): the private photo bucket, the object-path
-- convention, the storage policies and the 90-day retention selector.
-- Run this script in Supabase Dashboard → SQL Editor (there is no migration runner here).
--
-- Context: `public.attendance` has carried `check_in_photo_url` / `check_out_photo_url` since
-- SCRUM-21, but no bucket ever existed, so both columns were always null (the web check-in says so
-- in `/check-in`, and the mobile app captures a photo but never uploaded it). A4 makes the face
-- photo part of the record, which needs four things — this script is the database half of each:
--
--   1. a **private** bucket, so a leaked object path is not a leaked face;
--   2. a path convention a storage policy can decide on its own (the `storage` schema cannot join
--      `public.attendance`, so the identifiers travel in the folder name);
--   3. upload / read / delete policies that repeat the app's role model (SCRUM-59/60) and the
--      tenant boundary every other policy uses (SCRUM-51/53);
--   4. one place that says when a photo has outlived its retention period — 90 days, per the
--      approved A4 decision.
--
-- What this script deliberately does NOT do is delete anything. Removing an object is a Storage API
-- call (`storage.from('attendance-photos').remove([...])`); a `delete from storage.objects` typed
-- into the SQL editor leaves the file itself behind in the object store. Section 7 lists the three
-- supported ways to act on the list this script produces.
--
-- Prerequisites: SCRUM-51 (`organizations`) and SCRUM-59 (`is_organization_manager` /
-- `is_organization_owner`), which the policies below call. Idempotent: safe to re-run.

-- ── 1. The bucket ────────────────────────────────────────────────────────────────────────────
-- `public = false`: every read goes through a short-lived signed URL that
-- `GET /api/attendance/{id}/photo` mints only after RLS let the caller read the attendance row, so
-- the object is never reachable by guessing a path. 5 MB is generous for a front-camera JPEG, and
-- the mime allowlist keeps a client from parking a document in a face-photo bucket.
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'attendance-photos',
    'attendance-photos',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  )
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
exception
  when undefined_column then
    -- An older storage schema without the two limit columns: the bucket still has to exist, and a
    -- public bucket is the one outcome that must never happen, so it is re-asserted here as well.
    insert into storage.buckets (id, name, public)
    values ('attendance-photos', 'attendance-photos', false)
    on conflict (id) do update set public = false;
    raise notice 'storage.buckets has no file_size_limit/allowed_mime_types; the bucket was created without them.';
end;
$$;

-- ── 2. The path convention ──────────────────────────────────────────────────────────────────
--   <organization_id>/<employee_id>/<work_date>/<in|out>-<yyyyMMddThhmmssZ>.jpg
--   e.g. 3f6c0d1e-…/9a1e77b2-…/2026-11-14/in-20261114T013012Z.jpg
--
--   (storage.foldername(name))[1] = the organization the photo belongs to
--   (storage.foldername(name))[2] = the employee who was photographed
--   (storage.foldername(name))[3] = the work date (Asia/Bangkok), which is also the retention clock
--
-- The mobile app builds this path, uploads the file **first**, then writes the path into
-- `attendance.check_in_photo_url` in the same call that records the check-in — never a later update:
-- `attendance_guard_self_update` (SCRUM-21) locks that column for a non-manager, so a photo added
-- after the fact would be refused by the database. The check-out photo travels in the check-out
-- update, which is not locked.
--
-- `attendance.check_in_photo_url` / `check_out_photo_url` now hold an object path, not a URL. The
-- column names are historical and are kept on purpose: renaming a column the app already selects
-- would break the read path for no gain.

comment on column public.attendance.check_in_photo_url is
  'Đường dẫn object trong bucket private attendance-photos (ví dụ <org>/<employee>/<work_date>/in-...jpg), không phải URL công khai. Xem SCRUM-95.';
comment on column public.attendance.check_out_photo_url is
  'Đường dẫn object trong bucket private attendance-photos cho ảnh ra ca; null khi ca chưa chấm ra hoặc chấm ra trên web. Xem SCRUM-95.';

-- ── 3. Upload: one's own folder, inside one's own organization ──────────────────────────────
-- The employee id in the folder must be the caller — the storage equivalent of
-- `attendance_insert_own`'s `employee_id = auth.uid()`. The organization folder must be the caller's
-- own tenant, the equivalent of `organization_id = current_organization_id()`.
-- `current_organization_id()` is `security definer` (SCRUM-54), so it answers here even though it
-- reads the caller's own `users` row through an RLS-guarded policy.
--
-- `not is_organization_owner()` mirrors SCRUM-68: the organization's owner never clocks in, so an
-- upload from them could only ever leave an orphan object behind (and it would be listed by the
-- retention query as such). A MANAGER stays allowed — a chi nhánh trưởng does clock in, at a branch
-- they head.
drop policy if exists attendance_photos_insert_own on storage.objects;

create policy attendance_photos_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'attendance-photos'
    and auth.uid() is not null
    and not public.is_organization_owner()
    and (storage.foldername(name))[1] = public.current_organization_id()::text
    and (storage.foldername(name))[2] = auth.uid()::text
    and array_length(storage.foldername(name), 1) >= 3
  );

-- ── 4. Read: one's own photo, or the whole organization as a manager/owner ──────────────────
-- `is_organization_manager()` is true for `OWNER` and `MANAGER` (SCRUM-59) — exactly the pair that
-- may open `/attendance` (SCRUM-60/68). An employee therefore sees only their own face in the
-- bucket, and a manager of another organization sees nothing: the organization folder is the tenant
-- boundary, the same one every other policy uses.
drop policy if exists attendance_photos_select_scope on storage.objects;

create policy attendance_photos_select_scope
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'attendance-photos'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or (
        (storage.foldername(name))[1] = public.current_organization_id()::text
        and public.is_organization_manager()
      )
    )
  );

-- ── 5. Delete: the organization's owner only, inside the organization ──────────────────────
-- A photo is the evidence behind a timesheet row, so there is no UPDATE policy at all (an object is
-- written once; a replacement is a new object). Deletion exists for one reason — the retention job.
-- It is owner-scoped for the same reason branch deletion is (SCRUM-61): removing evidence is not a
-- per-branch decision. It also lets a future owner-only "Dọn ảnh cũ" action call the Storage API
-- with the owner's own session, so the app never needs a service-role key. Nothing in the app
-- deletes a photo today.
drop policy if exists attendance_photos_delete_owner on storage.objects;

create policy attendance_photos_delete_owner
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'attendance-photos'
    and (storage.foldername(name))[1] = public.current_organization_id()::text
    and public.is_organization_owner()
  );

-- ── 6. Retention: 90 days, in one place ─────────────────────────────────────────────────────
-- The number lives in a function so the script, the app copy and any future job cannot disagree.
create or replace function public.attendance_photo_retention_days()
returns integer
language sql
immutable
as $$
  select 90;
$$;

comment on function public.attendance_photo_retention_days() is
  'A4/SCRUM-95: số ngày lưu ảnh chấm công (90). App, script và tài liệu đọc cùng một con số.';

-- Which objects have outlived the retention period. Two distinct cases, one list:
--   * RETENTION — the object is referenced by an attendance row whose `work_date` is older than the
--     window. The **work date** is the clock, not the upload time, so a check-in synced late from an
--     offline phone still expires on time.
--   * ORPHAN — nothing references the object and it was uploaded longer ago than the window. That
--     is what a failed insert after a successful upload leaves behind, and it is also the shape a
--     hand-written upload produces.
-- The `or` join is not index-friendly, which is fine: this runs by hand (or once a night), never in
-- the request path. `p_limit` is clamped so a mistyped call cannot list a whole bucket.
create or replace function public.attendance_expired_photos(
  p_retention_days integer default null,
  p_limit integer default 500
)
returns table (
  object_name text,
  reason text,
  work_date date,
  uploaded_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with retention as (
    select coalesce(p_retention_days, public.attendance_photo_retention_days()) as days
  ),
  referenced as (
    select o.name, o.created_at, min(t.work_date) as work_date
    from storage.objects o
    join public.attendance t
      on t.check_in_photo_url = o.name
      or t.check_out_photo_url = o.name
    where o.bucket_id = 'attendance-photos'
    group by o.name, o.created_at
  ),
  orphans as (
    select o.name, o.created_at
    from storage.objects o
    where o.bucket_id = 'attendance-photos'
      and not exists (
        select 1
        from public.attendance t
        where t.check_in_photo_url = o.name
          or t.check_out_photo_url = o.name
      )
  ),
  expired as (
    select r.name, r.created_at, r.work_date, 'RETENTION'::text as reason
    from referenced r
    cross join retention ret
    where r.work_date < (now() at time zone 'Asia/Bangkok')::date - ret.days
    union all
    select o.name, o.created_at, null::date, 'ORPHAN'::text
    from orphans o
    cross join retention ret
    where o.created_at < now() - make_interval(days => ret.days)
  )
  select e.name, e.reason, e.work_date, e.created_at
  from expired e
  order by e.created_at
  limit greatest(1, least(coalesce(p_limit, 500), 5000));
$$;

-- Internal: it reads every organization's `storage.objects`. Postgres grants EXECUTE to PUBLIC and
-- PostgREST exposes public functions as RPCs, so without this revoke any member could list the
-- object names of another tenant (the same reasoning as SCRUM-70's fan-out helpers).
revoke all on function public.attendance_expired_photos(integer, integer)
  from public, anon, authenticated;
grant execute on function public.attendance_expired_photos(integer, integer)
  to service_role;

-- The retention constant itself is public copy ("ảnh được lưu 90 ngày"), not a leak.
revoke all on function public.attendance_photo_retention_days() from public, anon;
grant execute on function public.attendance_photo_retention_days()
  to authenticated, service_role;

-- ── 7. Acting on the list (pick one; nothing below runs by itself) ──────────────────────────
-- (a) By hand, now — Supabase Dashboard → Storage → `attendance-photos`. Run
--     `select * from public.attendance_expired_photos();` in the SQL editor, then select those
--     paths in the Storage browser and Delete. This is the only place a bulk delete with the
--     service role happens, and it is deliberate: the app has no service-role key.
-- (b) From the app, later — an owner-only "Dọn ảnh cũ" action calls the Storage API with the
--     owner's own session (`storage.from('attendance-photos').remove(paths)`), which
--     `attendance_photos_delete_owner` above already permits. No service-role key, no new client.
-- (c) Scheduled — only if the project enables `pg_cron` (it is not enabled here, and a scheduled
--     job is an ask-first change). Automating it means calling the Storage API over HTTP from the
--     database with a service-role secret stored in the database, which is exactly the key this
--     repository forbids. Prefer (b) behind a daily cron on the app's host instead.

-- ── 8. Verify ───────────────────────────────────────────────────────────────────────────────
-- 1. The bucket must exist and `public` must be false.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'attendance-photos';

-- 2. Exactly the three policies this script owns, each with the predicate above. The insert policy
--    must mention `auth.uid()` and `current_organization_id()`; the select policy must mention
--    `is_organization_manager()`; the delete policy must mention `is_organization_owner()` — a delete
--    that still said `is_organization_manager()` would let a branch manager erase evidence.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'attendance_photos_%'
order by policyname;

-- 3. The retention selector must run (0 rows on a young project) and must be unreachable by the app.
select count(*) as expired_photos from public.attendance_expired_photos();
select
  has_function_privilege(
    'authenticated',
    'public.attendance_expired_photos(integer, integer)',
    'execute'
  ) as authenticated_can_execute;  -- must be false

-- 4. End-to-end, while signed in as an employee in the app (or through the Storage API):
--      upload  <org>/<me>/<today>/in-….jpg              → 200
--      upload  <org>/<somebody-else>/<today>/in-….jpg   → 403 (new row violates row-level security)
--      upload  <another-org>/<me>/<today>/in-….jpg      → 403
--      signed URL for <org>/<me>/<today>/in-….jpg       → 200 (that is what the photo route does)

