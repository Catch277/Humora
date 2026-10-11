-- SCRUM-23: Bảng công — sửa giờ và xử lý khiếu nại (manager corrections + complaint resolution).
-- Run this script in Supabase Dashboard > SQL Editor.
--
-- SCRUM-21 created public.attendance; this script adds the review columns on top of it (that
-- script is already applied, so it is not edited). Both additions answer the same problem: a
-- manager must be able to fix a wrong timesheet and to close a complaint, and both must leave a
-- trace of who did it and why.
--
-- No RLS change is needed: `attendance_update_managers` already lets OWNER/CHU update any record,
-- and `attendance_guard_self_update` only locks the check-in facts for non-managers.

-- ── Corrections ──────────────────────────────────────────────────────────────────────────
alter table public.attendance add column if not exists corrected_by uuid references public.users (id);
alter table public.attendance add column if not exists corrected_at timestamptz;
alter table public.attendance add column if not exists correction_reason text;

-- A correction without a reason is not auditable, so the pair must travel together.
alter table public.attendance drop constraint if exists attendance_correction_reason_check;
alter table public.attendance add constraint attendance_correction_reason_check
  check (
    corrected_at is null
    or (correction_reason is not null and length(btrim(correction_reason)) > 0)
  ) not valid;

-- ── Complaint lifecycle ──────────────────────────────────────────────────────────────────
alter table public.attendance add column if not exists complaint_status text;
alter table public.attendance add column if not exists complaint_resolved_by uuid references public.users (id);
alter table public.attendance add column if not exists complaint_resolved_at timestamptz;

-- Existing complaints become OPEN; rows without a complaint keep a null status, so "no
-- complaint" and "unresolved complaint" stay distinguishable.
update public.attendance
set complaint_status = 'OPEN'
where complaint is not null
  and complaint_status is null;

alter table public.attendance drop constraint if exists attendance_complaint_status_check;
alter table public.attendance add constraint attendance_complaint_status_check
  check (complaint_status is null or complaint_status in ('OPEN', 'RESOLVED')) not valid;

-- The Bảng công screen filters open complaints, so it gets its own index.
create index if not exists attendance_complaint_status_idx
  on public.attendance (complaint_status);
