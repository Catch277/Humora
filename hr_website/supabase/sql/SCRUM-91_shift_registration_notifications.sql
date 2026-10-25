-- SCRUM-91: Thông báo cho đăng ký ca (shift_registrations, SCRUM-23).
-- Chạy trong Supabase Dashboard > SQL Editor, SAU SCRUM-23_shift_registration_swap.sql và
-- SCRUM-70/SCRUM-71 (script dùng `notify_user`, `notify_users`, `without_user` và các helper
-- `notification_*` của hai script đó). Idempotent: chạy lại nhiều lần vẫn an toàn.
--
-- Vì sao là trigger chứ không phải use case:
--
--   * Nhân viên đăng ký ca từ ứng dụng di động, tức là ghi thẳng vào `shift_registrations`; app web không
--     phải bên trung gian và cũng không thể tự ghi hộ người khác (`auth.uid() = user_id`).
--   * Trigger chia sẻ transaction với câu lệnh: một đăng ký bị rollback thì không để lại thông báo ma.
--   * `notify_user` tự bắt lỗi INSERT của chính nó (SCRUM-73), nên một bảng `notifications` lỗi thời không
--     làm hỏng việc đăng ký ca.
--
-- Ai nhận gì:
--
--   * Đăng ký mới (PENDING) → chủ sở hữu tổ chức + trưởng chi nhánh của chi nhánh đó (trừ người vừa bấm).
--     Đây chính là người duyệt được: `review_shift_registration()` chỉ cho `is_organization_owner()` hoặc
--     `heads_branch(branch_id)`.
--   * Bị từ chối → chính nhân viên, kèm lý do.
--   * Được duyệt → KHÔNG gửi thông báo riêng: RPC tạo luôn dòng `shift_assignments`, và trigger
--     `shift_assignments_notify_assigned` (SCRUM-71 §4) đã báo `SHIFT_ASSIGNED` cho nhân viên. Thêm một
--     cái chuông nữa chỉ nói lại đúng một việc.

-- ── 0. Điều kiện tiên quyết ──────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.shift_registrations') is null then
    raise exception 'SCRUM-91: run SCRUM-23_shift_registration_swap.sql first (public.shift_registrations is missing).';
  end if;

  if to_regprocedure('public.notify_user(uuid, text, text, text, text, uuid, interval)') is null
     or to_regprocedure('public.notify_users(uuid[], text, text, text, text, uuid, interval)') is null then
    raise exception 'SCRUM-91: run SCRUM-70_notifications_fanout.sql first (notify_user/notify_users are missing).';
  end if;

  if to_regprocedure('public.organization_owner_ids(uuid)') is null
     or to_regprocedure('public.branch_manager_ids(uuid)') is null
     or to_regprocedure('public.without_user(uuid[], uuid)') is null
     or to_regprocedure('public.notification_shift_phrase(uuid)') is null
     or to_regprocedure('public.notification_date_label(date)') is null
     or to_regprocedure('public.notification_branch_name(uuid)') is null
     or to_regprocedure('public.notification_actor_name(uuid)') is null then
    raise exception 'SCRUM-91: run SCRUM-70 and SCRUM-71 first (the notification_* helpers are missing).';
  end if;
end $$;

-- ── 1. Đăng ký ca mới → chủ sở hữu + trưởng chi nhánh ─────────────────────────────────────────
create or replace function public.notify_shift_registration_filed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_recipients uuid[];
begin
  -- An APPROVED/REJECTED/CANCELLED row inserted directly is history, not a request.
  if new.status <> 'PENDING' then
    return null;
  end if;

  v_recipients := public.without_user(
    coalesce(public.organization_owner_ids(new.organization_id), '{}'::uuid[])
      || coalesce(public.branch_manager_ids(new.branch_id), '{}'::uuid[]),
    v_actor
  );

  if coalesce(cardinality(v_recipients), 0) = 0 then
    return null;
  end if;

  perform public.notify_users(
    v_recipients,
    'Có đăng ký ca mới cần duyệt',
    format(
      '%s đăng ký %s ngày %s tại %s.%s',
      public.notification_actor_name(coalesce(v_actor, new.employee_id)),
      public.notification_shift_phrase(new.shift_id),
      public.notification_date_label(new.work_date),
      public.notification_branch_name(new.branch_id),
      case
        when new.note is null or btrim(new.note) = '' then ''
        else format(' Ghi chú: %s', new.note)
      end
    ),
    'SHIFT_REGISTERED',
    'shift_registration',
    new.id
  );

  return null;
end;
$$;

drop trigger if exists shift_registrations_notify_filed on public.shift_registrations;
create trigger shift_registrations_notify_filed
  after insert on public.shift_registrations
  for each row execute function public.notify_shift_registration_filed();

-- ── 2. Bị từ chối → nhân viên, kèm lý do ─────────────────────────────────────────────────────
create or replace function public.notify_shift_registration_reviewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only PENDING → REJECTED. Approval is covered by SHIFT_ASSIGNED (see the header), and a CANCELLED row is
  -- the employee's own click, which nobody needs to be told about.
  if new.status <> 'REJECTED' or old.status = 'REJECTED' then
    return null;
  end if;

  perform public.notify_user(
    new.employee_id,
    'Đăng ký ca bị từ chối',
    format(
      'Đăng ký %s ngày %s tại %s đã bị từ chối. Lý do: %s',
      public.notification_shift_phrase(new.shift_id),
      public.notification_date_label(new.work_date),
      public.notification_branch_name(new.branch_id),
      coalesce(nullif(btrim(new.reject_reason), ''), 'quản lý không nêu lý do')
    ),
    'SHIFT_REGISTRATION_REJECTED',
    'shift_registration',
    new.id
  );

  return null;
end;
$$;

drop trigger if exists shift_registrations_notify_reviewed on public.shift_registrations;
create trigger shift_registrations_notify_reviewed
  after update on public.shift_registrations
  for each row execute function public.notify_shift_registration_reviewed();

-- ── 3. Chỉ trigger gọi được hai hàm này ──────────────────────────────────────────────────────
-- PostgREST công khai mọi function trong schema `public` như một RPC; không revoke thì bất kỳ ai đăng nhập
-- cũng gọi được `notify_shift_registration_filed()` — và nó ghi thông báo cho người khác.
revoke all on function public.notify_shift_registration_filed() from public;
revoke all on function public.notify_shift_registration_reviewed() from public;
revoke execute on function public.notify_shift_registration_filed() from anon, authenticated;
revoke execute on function public.notify_shift_registration_reviewed() from anon, authenticated;

-- ── 4. Kiểm tra ──────────────────────────────────────────────────────────────────────────────
-- 1. Mỗi trigger phải được cài đúng một lần.
select c.relname as table_name, t.tgname, p.proname as function_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
  and p.proname in ('notify_shift_registration_filed', 'notify_shift_registration_reviewed')
order by c.relname, t.tgname;

-- 2. Hai hàm phải trả `false` cho vai trò API (cột nào `true` là gửi thông báo giả mạo được).
select
  p.proname,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('notify_shift_registration_filed', 'notify_shift_registration_reviewed')
order by p.proname;

-- 3. Ai sẽ nhận thông báo cho từng đăng ký đang chờ (chỉ đọc, không ghi gì). Người duyệt được phải nằm
--    trong danh sách; một chi nhánh chưa có `manager_id` thì chỉ chủ sở hữu nhận — cột cuối nói ra điều đó.
select
  r.id as registration_id,
  r.work_date,
  s.name as shift_name,
  b.name as branch_name,
  public.organization_owner_ids(r.organization_id)
    || coalesce(public.branch_manager_ids(r.branch_id), '{}'::uuid[]) as recipients,
  (b.manager_id is null) as branch_has_no_manager
from public.shift_registrations r
join public.shifts s on s.id = r.shift_id
join public.branches b on b.id = r.branch_id
where r.status = 'PENDING'
order by r.work_date, r.created_at;
