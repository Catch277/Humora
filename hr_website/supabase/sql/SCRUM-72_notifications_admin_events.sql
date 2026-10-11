-- SCRUM-72 — notification triggers for the administration of the organization (nhân sự, chi nhánh,
-- thiết bị, thành viên).
-- ============================================================================================
-- SCRUM-71 covers the daily operation. This script covers the events that are the chủ sở hữu's
-- business: an account is created or given a new password, a member joins, a role or a branch
-- changes, somebody is marked as having left, a branch or a piece of equipment is created, edited,
-- moved or deleted, or an already-registered account is invited.
--
-- The audience is therefore mostly OWNER (plus the manager who heads the affected branch), while the
-- person the change is *about* is a direct recipient: an account must learn that its own role, branch
-- or password changed, and that it has been marked as đã nghỉ.
--
-- Two deliberate omissions:
--   * Creating an organization notifies nobody — the caller is its only member at that moment.
--   * Rotating the join code notifies nobody — it is an owner-only action with no other audience.
--
-- Depends on SCRUM-70 (the fan-out helpers). Applied by hand: Supabase Dashboard → SQL Editor.
-- Idempotent: safe to re-run.

-- ── 1. Role label ────────────────────────────────────────────────────────────────────────────
-- Mirrors `roleLabel` in lib/accessPolicy.ts so a notification and the screens name a role the same
-- way (`CHU` is normalised first).
create or replace function public.notification_role_label(p_role text)
returns text
language sql
stable
as $$
  select case public.normalized_role(p_role)
    when 'OWNER' then 'Chủ sở hữu'
    when 'MANAGER' then 'Quản lý chi nhánh'
    else 'Nhân viên'
  end;
$$;

revoke execute on function public.notification_role_label(text) from public, anon, authenticated;

-- ── 2. Nhân sự (public.users) ────────────────────────────────────────────────────────────────
-- `public.users` is written by three different hands — the SCRUM-50 sign-up trigger, the
-- staff-account Edge Function (service role, so `auth.uid()` is null) and `PATCH /api/users/{id}` —
-- which is exactly why this lives in a trigger instead of in three call sites.

create or replace function public.notify_staff_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_organization uuid;
  v_employee_name text;
begin
  if tg_op = 'INSERT' then
    -- An account created with a temporary password (SCRUM-52): the new member is the only audience,
    -- and the message is waiting for them at their first sign-in.
    if coalesce(new.must_change_password, false) then
      perform public.notify_user(
        new.id,
        'Tài khoản của bạn đã được tạo',
        'Tổ chức đã tạo tài khoản cho bạn. Hãy đổi mật khẩu tạm thời ngay khi đăng nhập lần đầu.',
        'ACCOUNT_CREATED',
        'user',
        new.id
      );
    end if;

    return null;
  end if;

  v_organization := new.organization_id;
  v_employee_name := public.notification_actor_name(new.id);

  -- A new temporary password (SCRUM-52) — false → true is the transition; a member choosing their
  -- own password afterwards (complete_password_change) must not ring the bell again.
  if coalesce(new.must_change_password, false)
     and not coalesce(old.must_change_password, false) then
    perform public.notify_user(
      new.id,
      'Mật khẩu của bạn đã được đặt lại',
      format(
        '%s đã cấp cho bạn một mật khẩu tạm thời mới. Hãy đổi ngay khi đăng nhập.',
        public.notification_actor_name(v_actor)
      ),
      'ACCOUNT_PASSWORD_RESET',
      'user',
      new.id
    );
  end if;

  -- Gia nhập tổ chức: only the self-join path — `join_organization` (SCRUM-51) sets the caller's own
  -- row. A provisioned account is *inserted* with `organization_id` already set (the Edge Function
  -- runs as the service role and has no `auth.uid()`), so it cannot be mistaken for a join.
  if old.organization_id is null
     and new.organization_id is not null
     and new.id = v_actor then
    perform public.notify_users(
      public.without_user(public.organization_owner_ids(new.organization_id), v_actor),
      'Thành viên mới gia nhập',
      format('%s đã tham gia tổ chức bằng mã tham gia.', v_employee_name),
      'ORGANIZATION_MEMBER_JOINED',
      'user',
      new.id
    );
  end if;

  -- Vai trò: the account itself is a direct recipient, and the chủ sở hữu (who did it, unless they
  -- are the actor) keeps the audit in their inbox.
  if public.normalized_role(new.role) is distinct from public.normalized_role(old.role) then
    perform public.notify_user(
      new.id,
      'Vai trò của bạn đã thay đổi',
      format(
        '%s đã đổi vai trò của bạn thành %s.',
        public.notification_actor_name(v_actor),
        public.notification_role_label(new.role)
      ),
      'STAFF_ROLE_CHANGED',
      'user',
      new.id
    );

    perform public.notify_users(
      public.without_user(public.organization_owner_ids(v_organization), v_actor),
      'Vai trò nhân sự đã thay đổi',
      format(
        '%s: %s → %s.',
        v_employee_name,
        public.notification_role_label(old.role),
        public.notification_role_label(new.role)
      ),
      'STAFF_ROLE_CHANGED',
      'user',
      new.id
    );
  end if;

  -- Đã nghỉ (offboarding). The account is told, and so is management: a ca assigned to somebody who
  -- has left is exactly what a branch head has to re-plan.
  if coalesce(old.is_active, true) and not coalesce(new.is_active, true) then
    perform public.notify_user(
      new.id,
      'Tài khoản của bạn đã được đánh dấu đã nghỉ',
      format(
        '%s đã đánh dấu tài khoản của bạn là đã nghỉ. Liên hệ quản lý nếu đây là nhầm lẫn.',
        public.notification_actor_name(v_actor)
      ),
      'STAFF_OFFBOARDED',
      'user',
      new.id
    );

    perform public.notify_users(
      public.without_user(
        public.organization_owner_ids(v_organization)
          || public.branch_manager_ids(new.branch_id),
        v_actor
      ),
      'Nhân sự đã nghỉ',
      format(
        '%s đã đánh dấu %s là đã nghỉ — kiểm tra lại các ca đã xếp và bàn giao.',
        public.notification_actor_name(v_actor),
        v_employee_name
      ),
      'STAFF_OFFBOARDED',
      'user',
      new.id
    );
  end if;

  -- Chi nhánh làm việc (SCRUM-63): the account learns where it now works, and the head of the branch
  -- it moved to learns that somebody joined their roster. The old branch's head is not told — the
  -- person merely left their list.
  if new.branch_id is distinct from old.branch_id then
    perform public.notify_user(
      new.id,
      'Chi nhánh làm việc của bạn đã thay đổi',
      format(
        '%s đã chuyển bạn sang %s.',
        public.notification_actor_name(v_actor),
        case
          when new.branch_id is null then 'không thuộc chi nhánh nào'
          else public.notification_branch_name(new.branch_id)
        end
      ),
      'STAFF_BRANCH_CHANGED',
      'user',
      new.id
    );

    perform public.notify_users(
      public.without_user(public.branch_manager_ids(new.branch_id), v_actor),
      'Nhân sự được gán về chi nhánh',
      format(
        '%s đã gán %s về %s.',
        public.notification_actor_name(v_actor),
        v_employee_name,
        public.notification_branch_name(new.branch_id)
      ),
      'STAFF_BRANCH_CHANGED',
      'user',
      new.id
    );
  end if;

  return null;
end;
$$;

drop trigger if exists users_notify_events on public.users;
create trigger users_notify_events
  after insert or update on public.users
  for each row execute function public.notify_staff_event();

-- ── 3. Chi nhánh (public.branches, SCRUM-47/61/67) ───────────────────────────────────────────
-- Creating, editing and deleting a branch is an owner decision (SCRUM-61), so the other chủ sở hữu
-- are the audience — plus the manager the branch is handed to or taken from, whose scope
-- (`branches.manager_id`) is exactly what changed.

create or replace function public.notify_branch_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'DELETE' then
    perform public.notify_users(
      public.without_user(public.organization_owner_ids(old.organization_id), v_actor),
      'Chi nhánh đã được xoá',
      format(
        '%s đã xoá chi nhánh %s.',
        public.notification_actor_name(v_actor),
        coalesce(nullif(btrim(old.name), ''), 'Chi nhánh')
      ),
      'BRANCH_DELETED',
      'branch',
      old.id
    );

    if old.manager_id is not null and old.manager_id <> v_actor then
      perform public.notify_user(
        old.manager_id,
        'Chi nhánh bạn phụ trách đã được xoá',
        format(
          '%s đã xoá chi nhánh %s.',
          public.notification_actor_name(v_actor),
          coalesce(nullif(btrim(old.name), ''), 'Chi nhánh')
        ),
        'BRANCH_DELETED',
        'branch',
        old.id
      );
    end if;

    return null;
  end if;

  if tg_op = 'INSERT' then
    perform public.notify_users(
      public.without_user(public.organization_owner_ids(new.organization_id), v_actor),
      'Chi nhánh mới',
      format(
        '%s đã tạo chi nhánh %s.',
        public.notification_actor_name(v_actor),
        public.notification_branch_name(new.id)
      ),
      'BRANCH_CREATED',
      'branch',
      new.id
    );

    -- A branch created with a manager already named: that manager's scope begins now.
    if new.manager_id is not null and new.manager_id <> v_actor then
      perform public.notify_user(
        new.manager_id,
        'Bạn được giao phụ trách chi nhánh',
        format(
          '%s đã giao bạn phụ trách %s.',
          public.notification_actor_name(v_actor),
          public.notification_branch_name(new.id)
        ),
        'BRANCH_MANAGER_ASSIGNED',
        'branch',
        new.id
      );
    end if;

    return null;
  end if;

  perform public.notify_users(
    public.without_user(public.organization_owner_ids(new.organization_id), v_actor),
    'Chi nhánh đã được cập nhật',
    format(
      '%s đã cập nhật chi nhánh %s.',
      public.notification_actor_name(v_actor),
      public.notification_branch_name(new.id)
    ),
    'BRANCH_UPDATED',
    'branch',
    new.id
  );

  -- `manager_id` *is* the scope a manager holds, so handing the branch on — or taking it away — is
  -- the one field change somebody else must hear about.
  if new.manager_id is distinct from old.manager_id then
    if new.manager_id is not null and new.manager_id <> v_actor then
      perform public.notify_user(
        new.manager_id,
        'Bạn được giao phụ trách chi nhánh',
        format(
          '%s đã giao bạn phụ trách %s.',
          public.notification_actor_name(v_actor),
          public.notification_branch_name(new.id)
        ),
        'BRANCH_MANAGER_ASSIGNED',
        'branch',
        new.id
      );
    end if;

    if old.manager_id is not null and old.manager_id <> v_actor then
      perform public.notify_user(
        old.manager_id,
        'Bạn không còn phụ trách chi nhánh',
        format(
          '%s đã giao %s cho người khác.',
          public.notification_actor_name(v_actor),
          public.notification_branch_name(new.id)
        ),
        'BRANCH_UPDATED',
        'branch',
        new.id
      );
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists branches_notify_events on public.branches;
create trigger branches_notify_events
  after insert or update or delete on public.branches
  for each row execute function public.notify_branch_event();

-- ── 4. Thiết bị (public.facilities, SCRUM-45/65/67) ─────────────────────────────────────────
-- A facility belongs to one branch, so its head is the first audience and the chủ sở hữu the second.
-- The asset tag (SCRUM-67) is part of the message: it is what is printed on the label, and a move
-- re-tags the row — which is exactly the fact a person holding the old label needs to hear.

-- Mirrors CONDITION_LABELS in app/facilities/page.tsx.
create or replace function public.notification_condition_label(p_condition text)
returns text
language sql
stable
as $$
  select case upper(btrim(coalesce(p_condition, '')))
    when 'GOOD' then 'Hoạt động tốt'
    when 'FAIR' then 'Cần theo dõi'
    when 'MAINTENANCE' then 'Đang sửa chữa'
    when 'BROKEN' then 'Hỏng, chờ xử lý'
    else coalesce(nullif(btrim(p_condition), ''), '—')
  end;
$$;

revoke execute on function public.notification_condition_label(text)
  from public, anon, authenticated;

create or replace function public.notify_facility_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_facility text;
begin
  if tg_op = 'DELETE' then
    perform public.notify_users(
      public.without_user(
        public.organization_owner_ids(old.organization_id)
          || public.branch_manager_ids(old.branch_id),
        v_actor
      ),
      'Thiết bị đã được xoá',
      format(
        '%s đã xoá thiết bị %s%s tại %s.',
        public.notification_actor_name(v_actor),
        coalesce(nullif(btrim(old.name), ''), 'Thiết bị'),
        coalesce(' (' || nullif(btrim(old.code), '') || ')', ''),
        public.notification_branch_name(old.branch_id)
      ),
      'FACILITY_DELETED',
      'facility',
      old.id
    );

    return null;
  end if;

  v_facility := coalesce(nullif(btrim(new.name), ''), 'Thiết bị')
    || coalesce(' (' || nullif(btrim(new.code), '') || ')', '');

  if tg_op = 'INSERT' then
    perform public.notify_users(
      public.without_user(
        public.organization_owner_ids(new.organization_id)
          || public.branch_manager_ids(new.branch_id),
        v_actor
      ),
      'Thiết bị mới',
      format(
        '%s đã thêm %s tại %s — tình trạng: %s.',
        public.notification_actor_name(v_actor),
        v_facility,
        public.notification_branch_name(new.branch_id),
        public.notification_condition_label(new.condition)
      ),
      'FACILITY_CREATED',
      'facility',
      new.id
    );

    return null;
  end if;

  -- A move is its own event: the tag is regenerated for the new branch, so both heads are told and
  -- the message carries the new code.
  if new.branch_id is distinct from old.branch_id then
    perform public.notify_users(
      public.without_user(
        public.organization_owner_ids(new.organization_id)
          || public.branch_manager_ids(old.branch_id)
          || public.branch_manager_ids(new.branch_id),
        v_actor
      ),
      'Thiết bị được chuyển chi nhánh',
      format(
        '%s đã chuyển %s từ %s sang %s — mã tài sản mới: %s.',
        public.notification_actor_name(v_actor),
        coalesce(nullif(btrim(new.name), ''), 'Thiết bị'),
        public.notification_branch_name(old.branch_id),
        public.notification_branch_name(new.branch_id),
        coalesce(nullif(btrim(new.code), ''), '—')
      ),
      'FACILITY_MOVED',
      'facility',
      new.id
    );

    return null;
  end if;

  perform public.notify_users(
    public.without_user(
      public.organization_owner_ids(new.organization_id)
        || public.branch_manager_ids(new.branch_id),
      v_actor
    ),
    'Thiết bị đã được cập nhật',
    format(
      '%s đã cập nhật %s tại %s%s.',
      public.notification_actor_name(v_actor),
      v_facility,
      public.notification_branch_name(new.branch_id),
      case
        when new.condition is distinct from old.condition
          then ' — tình trạng: ' || public.notification_condition_label(new.condition)
        else ''
      end
    ),
    'FACILITY_UPDATED',
    'facility',
    new.id
  );

  return null;
end;
$$;

drop trigger if exists facilities_notify_events on public.facilities;
create trigger facilities_notify_events
  after insert or update or delete on public.facilities
  for each row execute function public.notify_facility_event();

-- ── 5. Nhóm thiết bị (public.facility_categories, SCRUM-65) ─────────────────────────────────
-- A group belongs to the whole organization rather than to a branch, so its audience is the chủ sở
-- hữu. There is no edit and no delete (a code is what the facilities store, so renaming or removing
-- one would orphan rows), which is why only the INSERT needs a trigger.

create or replace function public.notify_facility_category_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_users(
    public.without_user(public.organization_owner_ids(new.organization_id), auth.uid()),
    'Nhóm thiết bị mới',
    format(
      '%s đã thêm nhóm thiết bị "%s" vào danh mục.',
      public.notification_actor_name(auth.uid()),
      coalesce(nullif(btrim(new.name), ''), new.code)
    ),
    'FACILITY_CATEGORY_CREATED',
    'facility_category',
    new.id
  );

  return null;
end;
$$;

drop trigger if exists facility_categories_notify_created on public.facility_categories;
create trigger facility_categories_notify_created
  after insert on public.facility_categories
  for each row execute function public.notify_facility_category_created();

-- ── 6. Lời mời vào tổ chức (public.organization_invites, SCRUM-51) ───────────────────────────
-- Only an invitation addressed to an account that already exists can be delivered in-app: the allow
-- list is keyed by email, and an address with no `auth.users` row has nobody to notify yet (that
-- person gets `ACCOUNT_CREATED` instead when the owner provisions them a password).
--
-- Reading `auth.users` is safe here because the function is `security definer` and is created by the
-- project owner in the SQL Editor; nothing of it is exposed through PostgREST.

create or replace function public.notify_organization_invite_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_invitee uuid;
begin
  -- `source = 'provisioned'` is the Edge Function's own row for an account it creates in the same
  -- breath; that account is told about its new password, not about an invitation.
  if new.source <> 'invite' then
    return null;
  end if;

  select u.id
  into v_invitee
  from auth.users u
  where lower(u.email) = lower(btrim(new.email))
  limit 1;

  if v_invitee is null or v_invitee = v_actor then
    return null;
  end if;

  perform public.notify_user(
    v_invitee,
    'Bạn được mời vào tổ chức',
    format(
      '%s đã mời bạn tham gia tổ chức. Hãy dùng mã tham gia để vào.',
      public.notification_actor_name(v_actor)
    ),
    'ORGANIZATION_INVITED',
    'organization',
    new.organization_id
  );

  return null;
end;
$$;

drop trigger if exists organization_invites_notify_created on public.organization_invites;
create trigger organization_invites_notify_created
  after insert on public.organization_invites
  for each row execute function public.notify_organization_invite_created();

-- ── 7. Tổ chức (public.organizations, SCRUM-51) ─────────────────────────────────────────────
-- Renaming the organization is an owner-only action and there may be several owners, so the others
-- hear about it. *Creating* one notifies nobody on purpose: the caller is its only member at that
-- moment, and there is nothing to say to somebody who just did it.

create or replace function public.notify_organization_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name is not distinct from old.name then
    return null;
  end if;

  perform public.notify_users(
    public.without_user(public.organization_owner_ids(new.id), auth.uid()),
    'Tổ chức đã được cập nhật',
    format(
      '%s đã đổi tên tổ chức thành %s.',
      public.notification_actor_name(auth.uid()),
      coalesce(nullif(btrim(new.name), ''), '—')
    ),
    'ORGANIZATION_UPDATED',
    'organization',
    new.id
  );

  return null;
end;
$$;

drop trigger if exists organizations_notify_updated on public.organizations;
create trigger organizations_notify_updated
  after update on public.organizations
  for each row execute function public.notify_organization_updated();

-- ── 8. Verify ────────────────────────────────────────────────────────────────────────────────
-- 1. Every trigger this script owns must be installed exactly once.
select c.relname as table_name, t.tgname, p.proname as function_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
  and p.proname in (
    'notify_staff_event', 'notify_branch_event', 'notify_facility_event',
    'notify_facility_category_created', 'notify_organization_invite_created',
    'notify_organization_updated'
  )
order by c.relname, t.tgname;

-- 2. The label helpers must be unreachable from the API roles (the same rule as SCRUM-70/71).
select
  p.proname,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('notification_role_label', 'notification_condition_label')
order by p.proname;

-- 3. The three tables this script observes must carry the columns it reads. A missing one means the
--    prerequisite script has not been applied (SCRUM-53 for `organization_id`, SCRUM-63 for
--    `users.branch_id`) and every write above would fail — fix that before using the app.
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'branches' and column_name in ('organization_id', 'manager_id'))
    or (table_name = 'users' and column_name in ('organization_id', 'branch_id', 'is_active', 'must_change_password'))
    or (table_name = 'facilities' and column_name in ('organization_id', 'branch_id', 'code', 'condition'))
    or (table_name = 'organization_invites' and column_name in ('organization_id', 'email', 'source'))
  )
order by table_name, column_name;
-- Expected: 2 branches + 4 users + 4 facilities + 3 organization_invites rows.

-- 4. One write of the trigger chain, end to end. Replace the two ids, run it, then delete the
--    notification it created (the row is real, which is the point).
-- select count(*) as before_count from public.notifications;
-- update public.users set is_active = false where id = '<một nhân viên>';
-- select count(*) as after_count from public.notifications;  -- must be before_count + 2
--    (one for the account, one for management) — then flip `is_active` back and delete them:
-- delete from public.notifications where type = 'STAFF_OFFBOARDED';
